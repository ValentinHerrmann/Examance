/**
 * Import .bgproj archive file into local IndexedDB storage.
 *
 * Enforces atomic full-archive decryption before any database modification occurs.
 * Prevents partial/corrupted data imports if password is wrong or ciphertext is tampered.
 */

import { db, clearAllTables } from '$lib/db/db';
import { sessionStore } from '$lib/stores/session';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  type ProgressEvent,
} from './format';
import { deriveKey } from '$lib/crypto/keyDerivation';
import { deriveSessionKey } from '$lib/crypto/sessionKey';
import { decryptJson, toArrayBuffer } from '$lib/crypto/aesGcm';
import {
  saveExamEncrypted,
  saveExerciseEncrypted,
  saveStudentEncrypted,
  saveSubmissionEncrypted,
  saveScoreEncrypted,
} from '$lib/db/dbEncryption';

export async function unpackProject(
  archiveData: Blob | ArrayBuffer | Uint8Array,
  password: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<{ examCount: number; studentCount: number }> {
  onProgress?.({ stage: 'salt', current: 0, total: 100 });

  const buffer =
    archiveData instanceof ArrayBuffer
      ? archiveData
      : archiveData instanceof Uint8Array
        ? toArrayBuffer(archiveData)
        : await archiveData.arrayBuffer();
  const fileBytes = new Uint8Array(buffer);

  // 1. Verify minimum header size
  if (fileBytes.length < HEADER_SIZE) {
    throw new Error('Invalid archive: File too small to contain valid .bgproj header.');
  }

  // 2. Verify Magic bytes "BGPROJ\0"
  for (let i = 0; i < 7; i++) {
    if (fileBytes[i] !== BGPROJ_MAGIC[i]) {
      throw new Error('Invalid archive: File magic header does not match .bgproj format.');
    }
  }

  // 3. Verify Version byte
  const version = fileBytes[6];
  if (version !== BGPROJ_VERSION) {
    throw new Error(`Unsupported archive version ${version}. Expected version ${BGPROJ_VERSION}.`);
  }

  const salt = new Uint8Array(fileBytes.subarray(7, 23));
  const nonce = new Uint8Array(fileBytes.subarray(23, 35));

  // Extract payload length (4 bytes UInt32BE)
  const view = new DataView(buffer, 35, 4);
  const ctLen = view.getUint32(0, false);

  const ciphertext = new Uint8Array(fileBytes.subarray(41, 41 + ctLen));
  if (ciphertext.length !== ctLen) {
    throw new Error('Corrupted archive: Ciphertext length mismatch.');
  }

  onProgress?.({ stage: 'salt', current: 20, total: 100 });

  // 4. Derive key from header salt + password
  const { masterKey } = await deriveKey(password, salt);

  onProgress?.({ stage: 'encrypt', current: 40, total: 100 });

  // 5. ATOMIC OUTER DECRYPTION: Decrypt and authenticate entire envelope
  let decompressedInner: Uint8Array;
  try {
    const gcmKey = await deriveSessionKey(masterKey, nonce);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
      gcmKey,
      toArrayBuffer(ciphertext)
    );
    decompressedInner = new Uint8Array(decryptedBuffer);
  } catch {
    throw new Error('Decryption failed: Incorrect password or corrupted archive payload.');
  }

  onProgress?.({ stage: 'db_writes', current: 60, total: 100 });

  // 6. Parse payload JSON
  let payload: any;
  try {
    const jsonStr = new TextDecoder().decode(decompressedInner);
    payload = JSON.parse(jsonStr);
  } catch {
    throw new Error('Corrupted archive: Payload is not valid JSON.');
  }

  // 7. WIPE IDB ONLY AFTER ATOMIC DECRYPTION SUCCEEDS
  await clearAllTables();

  // 8. Re-initialize active session store with imported key
  await sessionStore.unlock({
    masterKey,
    sessionKey: await deriveSessionKey(masterKey, nonce),
    sessionNonce: nonce,
    mode: 'local',
  });

  // Get current active key from store
  let activeKey: CryptoKey | null = null;
  const unsubscribe = sessionStore.subscribe((s) => {
    activeKey = s.sessionKey;
  });
  unsubscribe();

  if (!activeKey) {
    throw new Error('Failed to initialize session key after unpacking archive.');
  }

  // 9. Repopulate IDB tables encrypted with active session key
  let examCount = 0;
  let studentCount = 0;

  if (Array.isArray(payload.exams) && payload.exams.length > 0) {
    examCount = payload.exams.length;
    for (const item of payload.exams) {
      await saveExamEncrypted(item, activeKey);
    }
  }

  if (Array.isArray(payload.exercises) && payload.exercises.length > 0) {
    for (const item of payload.exercises) {
      await saveExerciseEncrypted(item, activeKey);
    }
  }

  if (Array.isArray(payload.students) && payload.students.length > 0) {
    studentCount = payload.students.length;
    for (const item of payload.students) {
      await saveStudentEncrypted(item, activeKey);
    }
  }

  if (Array.isArray(payload.submissions) && payload.submissions.length > 0) {
    for (const item of payload.submissions) {
      await saveSubmissionEncrypted(item, activeKey);
    }
  }

  if (Array.isArray(payload.exerciseScores) && payload.exerciseScores.length > 0) {
    for (const score of payload.exerciseScores) {
      await saveScoreEncrypted(score, activeKey);
    }
  }

  if (Array.isArray(payload.exerciseExams) && payload.exerciseExams.length > 0) {
    await db.examExercises.bulkPut(payload.exerciseExams);
  }

  if (Array.isArray(payload.examMcGroups) && payload.examMcGroups.length > 0) {
    await db.examMcGroups.bulkPut(payload.examMcGroups);
  }

  if (Array.isArray(payload.auditLogs) && payload.auditLogs.length > 0) {
    await db.auditLog.bulkPut(payload.auditLogs);
  }

  onProgress?.({ stage: 'complete', current: 100, total: 100 });

  return { examCount, studentCount };
}
