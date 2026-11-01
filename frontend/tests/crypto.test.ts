import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, toBase64url, fromBase64url, uint8ArrayToBase64, base64ToUint8Array } from '../src/lib/crypto/aesGcm';
import { joinKey, keyFromRaw, pseudonymBase } from '../src/lib/crypto/pseudonymKey';
import { sessionStore } from '../src/lib/stores/session';
import { hkdfMasterKey } from './helpers/keys';
import { deriveSessionKey, generateSessionNonce } from '../src/lib/crypto/sessionKey';
import { getUserSalt, getUserSessionNonce } from '../src/lib/crypto/keyDerivation';
import {
  encryptExam,
  decryptExam,
  encryptExercise,
  decryptExercise,
} from '../src/lib/db/dbEncryption';

describe('AES-256-GCM Cryptography', () => {
  it('encrypts and decrypts round-trip successfully', async () => {
    const rawKey = new Uint8Array(32).fill(7);
    const key = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const plaintext = new TextEncoder().encode('Hello BlindGrade Privacy!');
    const { ciphertext, iv } = await encrypt(key, plaintext);

    expect(ciphertext.length).toBeGreaterThan(plaintext.length);
    expect(iv.length).toBe(12);

    const decrypted = await decrypt(key, ciphertext, iv);
    expect(new TextDecoder().decode(decrypted)).toBe('Hello BlindGrade Privacy!');
  });

  it('generates a fresh random IV on every encrypt call', async () => {
    const rawKey = new Uint8Array(32).fill(1);
    const key = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const plaintext = new TextEncoder().encode('Identical payload');
    const res1 = await encrypt(key, plaintext);
    const res2 = await encrypt(key, plaintext);

    // IVs must be different
    expect(res1.iv).not.toEqual(res2.iv);
    // Ciphertexts must be different due to different IVs
    expect(res1.ciphertext).not.toEqual(res2.ciphertext);
  });

  it('throws DOMException when decrypting tampered ciphertext', async () => {
    const rawKey = new Uint8Array(32).fill(5);
    const key = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const plaintext = new TextEncoder().encode('Secret Data');
    const { ciphertext, iv } = await encrypt(key, plaintext);

    // Tamper with the last byte (part of GCM tag)
    const tampered = new Uint8Array(ciphertext);
    tampered[tampered.length - 1] ^= 0xff;

    await expect(decrypt(key, tampered, iv)).rejects.toThrow();
  });

  it('correctly encodes and decodes base64url', () => {
    const original = new Uint8Array([0, 255, 128, 64, 32, 16]);
    const b64 = toBase64url(original);
    const decoded = fromBase64url(b64);
    expect(decoded).toEqual(original);
  });

  it('correctly decodes base64 and base64url with base64ToUint8Array', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33]);
    const b64 = uint8ArrayToBase64(original);
    expect(base64ToUint8Array(b64)).toEqual(original);

    const b64url = toBase64url(original);
    expect(base64ToUint8Array(b64url)).toEqual(original);

    expect(base64ToUint8Array('')).toEqual(new Uint8Array(0));
  });

  it('encrypts and decrypts typed array views with non-zero byteOffset', async () => {
    const rawKey = new Uint8Array(32).fill(9);
    const key = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const fullBuffer = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const slicedPayload = fullBuffer.subarray(2, 8); // [30, 40, 50, 60, 70, 80] with byteOffset 2

    const { ciphertext, iv } = await encrypt(key, slicedPayload);
    const decrypted = await decrypt(key, ciphertext, iv);

    expect(decrypted).toEqual(slicedPayload);
  });
});

describe('Keyed per-exam pseudonyms (S3, issue #177)', () => {
  const unlockWith = async (fill: number) => {
    const aes = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(1), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(fill), sessionKey: aes, sessionNonce: new Uint8Array(12) });
  };
  const id = 'student-uuid-1234-5678';

  it('is deterministic, 64 hex characters, and keyed over the old SHA-256 form', async () => {
    await unlockWith(42);
    const a = await keyFromRaw('exam-1', id);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await keyFromRaw('exam-1', id)).toBe(a);
    // A row the server only knows hashed re-keys to the same value as the raw id.
    expect(await keyFromRaw('exam-1', await pseudonymBase(id))).toBe(a);
    expect(a).not.toBe(await pseudonymBase(id));
  });

  it('differs per exam and per data key, and exam ids compare case-insensitively', async () => {
    await unlockWith(42);
    const a = await keyFromRaw('exam-1', id);
    expect(await keyFromRaw('exam-2', id)).not.toBe(a);
    expect(await keyFromRaw('EXAM-1', id)).toBe(a);
    await unlockWith(43);
    expect(await keyFromRaw('exam-1', id)).not.toBe(a);
  });

  it('joins a stored row on its keyed value and never re-keys a version-2 value', async () => {
    await unlockWith(42);
    const keyed = await keyFromRaw('exam-1', id);
    expect(await joinKey({ examId: 'exam-1', pseudonymHmac: id })).toBe(keyed);
    expect(await joinKey({ examId: 'exam-1', pseudonymHmac: await pseudonymBase(id), pseudonymVersion: 1 })).toBe(keyed);
    expect(await joinKey({ examId: 'exam-1', pseudonymHmac: keyed, pseudonymVersion: 2 })).toBe(keyed);
  });

  it('refuses without an unlocked data key', async () => {
    sessionStore.lock();
    await expect(keyFromRaw('exam-1', id)).rejects.toThrow();
  });
});

describe('Deterministic Key Derivation', () => {
  it('generates identical salt and nonce for identical email across sessions', async () => {
    const salt1 = await getUserSalt('teacher@example.com');
    const salt2 = await getUserSalt('TEACHER@example.com ');
    const nonce1 = await getUserSessionNonce('teacher@example.com');
    const nonce2 = await getUserSessionNonce('TEACHER@example.com ');

    expect(salt1.length).toBe(16);
    expect(nonce1.length).toBe(12);
    expect(salt1).toEqual(salt2);
    expect(nonce1).toEqual(nonce2);
  });

  it('generates different salt and nonce for different emails', async () => {
    const saltA = await getUserSalt('userA@example.com');
    const saltB = await getUserSalt('userB@example.com');
    const nonceA = await getUserSessionNonce('userA@example.com');
    const nonceB = await getUserSessionNonce('userB@example.com');

    expect(saltA).not.toEqual(saltB);
    expect(nonceA).not.toEqual(nonceB);
  });
});

describe('HKDF Session Key Derivation', () => {
  it('derives session key from master key and nonce', async () => {
    const masterRaw = new Uint8Array(32).fill(99);
    const masterKey = await crypto.subtle.importKey(
      'raw',
      masterRaw,
      'HKDF',
      false,
      ['deriveKey']
    );

    const nonce = generateSessionNonce();
    expect(nonce.length).toBe(12);

    const sessionKey = await deriveSessionKey(masterKey, nonce);
    expect(sessionKey.algorithm.name).toBe('AES-GCM');
  });

  it('derives identical session key when nonce has non-zero byteOffset', async () => {
    const masterRaw = new Uint8Array(32).fill(99);
    const masterKey = await crypto.subtle.importKey(
      'raw',
      masterRaw,
      'HKDF',
      false,
      ['deriveKey']
    );

    const fullBuffer = new Uint8Array(100);
    fullBuffer.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 20);
    const slicedNonce = fullBuffer.subarray(20, 32); // byteOffset 20
    const standaloneNonce = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    const keyFromSliced = await deriveSessionKey(masterKey, slicedNonce);
    const keyFromStandalone = await deriveSessionKey(masterKey, standaloneNonce);

    const testPlaintext = new TextEncoder().encode('Test Data');
    const encResult = await encrypt(keyFromSliced, testPlaintext);
    const decrypted = await decrypt(keyFromStandalone, encResult.ciphertext, encResult.iv);

    expect(decrypted).toEqual(testPlaintext);
  });
});

describe('IndexedDB Record Encryption-at-Rest', () => {
  async function createTestKey(): Promise<CryptoKey> {
    const rawKey = new Uint8Array(32).fill(123);
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  it('encrypts and decrypts ExamRecord payloads correctly', async () => {
    const key = await createTestKey();
    const originalExam = {
      id: 'exam-uuid-1',
      teacherId: 'teacher@school.org',
      title: 'Informatik Schulaufgabe',
      latexPreamble: '\\usepackage{tikz}',
      latexTemplate: '\\begin{document}Test\\end{document}',
      retentionUntil: '2026-12-31',
      compilationStatus: 'compiled' as const,
      createdAt: '2026-07-26T10:00:00Z',
    };

    const encrypted = await encryptExam(originalExam, key);
    expect(encrypted.payloadCt).toBeDefined();
    expect(encrypted.payloadIv).toBeDefined();

    // Decrypt with key
    const decrypted = await decryptExam(encrypted, key);
    expect(decrypted.title).toBe('Informatik Schulaufgabe');
    expect(decrypted.latexPreamble).toBe('\\usepackage{tikz}');
    expect(decrypted.latexTemplate).toBe('\\begin{document}Test\\end{document}');

    // Decrypt without key (locked state) returns unencrypted properties undefined
    const lockedDecrypted = await decryptExam(encrypted, null);
    expect(lockedDecrypted.title).toBeUndefined();
    expect(lockedDecrypted.latexPreamble).toBeUndefined();
  });

  it('encrypts and decrypts ExerciseRecord payloads correctly', async () => {
    const key = await createTestKey();
    const originalEx = {
      id: 'ex-uuid-1',
      name: 'Algorithm Analysis',
      latexBody: '\\begin{Aufgabe}{Sortieren}\\end{Aufgabe}',
      maxPoints: 10,
      questionType: 'free_text' as const,
      penalty: 0,
    };

    const encrypted = await encryptExercise(originalEx, key);
    expect(encrypted.payloadCt).toBeDefined();

    const decrypted = await decryptExercise(encrypted, key);
    expect(decrypted.name).toBe('Algorithm Analysis');
    expect(decrypted.latexBody).toBe('\\begin{Aufgabe}{Sortieren}\\end{Aufgabe}');

    const locked = await decryptExercise(encrypted, null);
    expect(locked.name).toBeUndefined();
    expect(locked.latexBody).toBeUndefined();
  });
});

describe('Large Binary & Pseudonym Validation Helpers', () => {
  it('converts large Uint8Array (1MB) to Base64 without call stack exceeded error', () => {
    const largeBuffer = new Uint8Array(1024 * 1024); // 1MB
    for (let i = 0; i < largeBuffer.length; i++) {
      largeBuffer[i] = i % 256;
    }
    const b64 = uint8ArrayToBase64(largeBuffer);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(1000000);
  });

  it('keeps the version-1 form exactly as older builds sent it', async () => {
    const rawUuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'; // 36 chars
    expect(await pseudonymBase(rawUuid)).toMatch(/^[0-9a-f]{64}$/);
    // Any 64-character value passed through unhashed; server rows were written that way.
    const existing64 = 'a'.repeat(64);
    expect(await pseudonymBase(existing64)).toBe(existing64);
  });
});
