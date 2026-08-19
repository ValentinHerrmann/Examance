/**
 * Export .bgproj archive file.
 *
 * Encrypts current IndexedDB records using a fresh Argon2id key derived from the user-provided export password.
 * Nonce and Salt Freshness Invariant: A fresh salt (16 bytes) and fresh session nonce (12 bytes) MUST be generated
 * for every single pack operation to ensure ciphertext uniqueness and prevent replay/key-reuse vulnerabilities.
 */

import { get } from 'svelte/store';
import { db } from '$lib/db/db';
import { sessionStore } from '$lib/stores/session';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  SALT_OFFSET,
  NONCE_OFFSET,
  PAYLOAD_OFFSET,
  type BgprojHeader,
  type ProgressCallback,
  type ProgressEventData,
} from './format';
import { deriveKey, generateSalt } from '$lib/crypto/keyDerivation';
import { deriveArchiveSecret, deriveSessionKey } from '$lib/crypto/sessionKey';
import { hmacSha256Hex, importHmacKey } from '$lib/crypto/hmac';
import { encryptJson, uint8ArrayToBase64 } from '$lib/crypto/aesGcm';
import {
  loadExamsEncrypted,
  loadExercisesEncrypted,
  loadStudentsEncrypted,
  loadSubmissionsEncrypted,
  decryptScore,
  decryptResourceBytes,
} from '$lib/db/dbEncryption';

export async function packProject(
  password: string,
  onProgress?: ProgressCallback
): Promise<Blob> {
  onProgress?.({
    phase: 'encrypting',
    current: 0,
    total: 100,
    message: 'Starting project encryption...',
  });

  // 1. NONCE & SALT FRESHNESS: Generate fresh salt and nonce for every single export
  const salt = generateSalt();
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);

  // 2. Derive fresh master key & archive secret
  const { masterKey } = await deriveKey(password, salt);
  const archiveSecretBuffer = await deriveArchiveSecret(masterKey);
  const archiveHmacKey = await importHmacKey(new Uint8Array(archiveSecretBuffer));

  // 3. Collect records from IDB
  const key = get(sessionStore).sessionKey;
  const exams = await loadExamsEncrypted(key);
  const exercises = await loadExercisesEncrypted(key);
  const students = await loadStudentsEncrypted(key);
  const submissions = await loadSubmissionsEncrypted(key);
  const rawScores = await db.exerciseScores.toArray();
  const exerciseScores = await Promise.all(rawScores.map(s => decryptScore(s, key)));
  const rawAuditLogs = await db.auditLog.toArray();

  // Load junction table linking exercises to exams and MC groups
  const exerciseExams = await db.examExercises.toArray();
  const examMcGroups = await db.examMcGroups.toArray();

  // Resource files are unwrapped like every other record — decrypted with the
  // current session key and base64'd, because JSON cannot carry raw bytes. The
  // archive envelope itself is what protects them; the importer re-encrypts
  // under its own key.
  const exerciseResources = await Promise.all(
    (await db.exerciseResources.toArray()).map(async r => ({
      id: r.id,
      exerciseId: r.exerciseId,
      filename: r.filename,
      mimeType: r.mimeType,
      byteSize: r.byteSize,
      createdAt: r.createdAt,
      dataB64: uint8ArrayToBase64(await decryptResourceBytes(r, key)),
    }))
  );

  onProgress?.({
    phase: 'encrypting',
    current: 30,
    total: 100,
    message: 'Encrypting database records...',
  });

  // 4. Compute pseudonym hashes for archive payload using archive secret
  const archivedStudents = await Promise.all(
    students.map(async s => ({
      ...s,
      pseudonymHash: await hmacSha256Hex(s.pseudonymId, archiveHmacKey),
    }))
  );

  const archivedSubmissions = await Promise.all(
    submissions.map(async sub => ({
      ...sub,
      pseudonymHash: await hmacSha256Hex(sub.pseudonymHash, archiveHmacKey),
    }))
  );

  const archivePayload = {
    exams,
    exercises,
    students: archivedStudents,
    submissions: archivedSubmissions,
    exerciseScores,
    exerciseExams,
    examMcGroups,
    exerciseResources,
    auditLogs: rawAuditLogs,
  };

  // 5. Encrypt payload with fresh archive session key using header nonce as IV
  const archiveSessionKey = await deriveSessionKey(masterKey, nonce);
  const encryptedPayload = await encryptJson(archivePayload, archiveSessionKey, nonce);

  onProgress?.({
    phase: 'packing',
    current: 70,
    total: 100,
    message: 'Writing archive binary header...',
  });

  // 6. Build binary layout: Magic (7) + Version (1) + Salt (16) + Nonce (12) + Payload
  const totalLength = HEADER_SIZE + encryptedPayload.ciphertext.byteLength;
  const fileBuffer = new Uint8Array(totalLength);

  // Write magic bytes "BGPROJ\0"
  fileBuffer.set(BGPROJ_MAGIC, 0);
  // Write version
  fileBuffer[6] = BGPROJ_VERSION;
  // Write salt & nonce
  fileBuffer.set(salt, SALT_OFFSET);
  fileBuffer.set(nonce, NONCE_OFFSET);
  // Write payload length (4 bytes UInt32BE) at offset 35
  const view = new DataView(fileBuffer.buffer);
  view.setUint32(35, encryptedPayload.ciphertext.byteLength, false);
  // Write ciphertext payload
  fileBuffer.set(new Uint8Array(encryptedPayload.ciphertext), PAYLOAD_OFFSET);

  onProgress?.({
    phase: 'complete',
    current: 100,
    total: 100,
    message: 'Project archive created successfully.',
  });

  return new Blob([fileBuffer], { type: 'application/octet-stream' });
}
