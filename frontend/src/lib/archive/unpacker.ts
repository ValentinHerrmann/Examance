/**
 * Import .bgproj archive file into local IndexedDB storage.
 *
 * Enforces atomic full-archive decryption before any database modification occurs.
 * Prevents partial/corrupted data imports if password is wrong or ciphertext is tampered.
 */

import { get } from 'svelte/store';
import { db, clearAllTables } from '$lib/db/db';
import { sessionStore } from '$lib/stores/session';
import { storagePolicyStore } from '$lib/stores/storagePolicy';
import { offlineQueue } from '$lib/services/offlineQueue';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  type ProgressEvent,
} from './format';
import { deriveKey } from '$lib/crypto/keyDerivation';
import { deriveSessionKey } from '$lib/crypto/sessionKey';
import { base64ToUint8Array, decryptJson, toArrayBuffer } from '$lib/crypto/aesGcm';
import {
  saveExamEncrypted,
  saveExerciseEncrypted,
  saveStudentEncrypted,
  saveSubmissionEncrypted,
  saveScoreEncrypted,
  encryptExam,
  encryptExercise,
  encryptResource,
} from '$lib/db/dbEncryption';
import { importPayloadToServer } from './serverImport';

export async function unpackProject(
  archiveData: Blob | ArrayBuffer | Uint8Array,
  password: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<{ examCount: number; studentCount: number; errors: string[] }> {
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

  // 8. Re-initialize active session store with imported key.
  // Preserve the existing session mode (e.g. 'authenticated'/'hybrid') instead of
  // forcing 'local' — otherwise an authenticated user's session gets silently
  // downgraded, which disables proactive token refresh and causes a burst of 401s
  // on the next server request.
  const priorMode = get(sessionStore).mode;
  await sessionStore.unlock({
    masterKey,
    sessionKey: await deriveSessionKey(masterKey, nonce),
    sessionNonce: nonce,
    mode: priorMode ?? 'local',
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

  // 9. Persist the archive contents.
  //
  // In server-backed modes the exam/exercise records must be *created* under the
  // importing account: saveExamEncrypted/saveExerciseEncrypted route through
  // examRepository.save()/exerciseRepository.save(), which PATCH an id the
  // account does not own and never write IndexedDB. importPayloadToServer()
  // creates them instead and reports any id substitutions it had to make.
  const isServerBacked = get(storagePolicyStore).storageMode !== 'all-local';
  const errors: string[] = [];
  let idMap = new Map<string, string>();

  const exams: any[] = Array.isArray(payload.exams) ? payload.exams : [];
  const exercises: any[] = Array.isArray(payload.exercises) ? payload.exercises : [];
  const examCount = exams.length;
  const studentCount = Array.isArray(payload.students) ? payload.students.length : 0;

  /** Rewrites an archived id to the id actually created on the server. */
  const remap = (id: string | undefined) => (id ? (idMap.get(id) ?? id) : id);

  if (isServerBacked) {
    const result = await importPayloadToServer(payload);
    idMap = result.idMap;
    errors.push(...result.errors);

    // Mirror into IndexedDB so the local cache is warm before the first refresh.
    for (const exam of exams) {
      if (!result.createdExamIds.has(exam.id)) continue;
      await db.exams.put(await encryptExam({ ...exam, id: remap(exam.id) }, activeKey));
    }
    for (const ex of exercises) {
      if (!result.createdExerciseIds.has(ex.id)) continue;
      await db.exercises.put(
        await encryptExercise(
          { ...ex, id: remap(ex.id), examId: remap(ex.examId) },
          activeKey
        )
      );
    }
  } else {
    for (const item of exams) {
      await saveExamEncrypted(item, activeKey);
    }
    for (const item of exercises) {
      await saveExerciseEncrypted(item, activeKey);
    }
  }

  // Students, submissions and scores go through their repositories in every mode
  // — those already keep identity data local in hybrid mode — but must point at
  // the exam ids that actually got created.
  //
  // Those repositories swallow server rejections into the offline queue, which
  // silently discards anything that is not a network error. A student identity
  // is globally unique by pseudonym_hmac and bound to a single exam, so an
  // archive re-imported onto the backend it came from is rejected with a 409;
  // the queue delta is the only signal available here, so report it rather than
  // let the records disappear unannounced.
  const queuedBefore = get(offlineQueue).length;

  if (Array.isArray(payload.students)) {
    for (const item of payload.students) {
      await saveStudentEncrypted({ ...item, examId: remap(item.examId) }, activeKey);
    }
  }

  if (Array.isArray(payload.submissions)) {
    for (const item of payload.submissions) {
      await saveSubmissionEncrypted({ ...item, examId: remap(item.examId) }, activeKey);
    }
  }

  const queuedAfter = get(offlineQueue).length;
  if (isServerBacked && queuedAfter > queuedBefore) {
    errors.push(
      `${queuedAfter - queuedBefore} student/submission record(s) were rejected by the server. ` +
        `This happens when the archive is re-imported onto the same server it was exported ` +
        `from: those student identities already belong to the original exam.`
    );
  }

  if (Array.isArray(payload.exerciseScores)) {
    for (const score of payload.exerciseScores) {
      await saveScoreEncrypted({ ...score, exerciseId: remap(score.exerciseId) }, activeKey);
    }
  }

  if (Array.isArray(payload.exerciseExams) && payload.exerciseExams.length > 0) {
    await db.examExercises.bulkPut(
      payload.exerciseExams.map((j: any) => ({
        ...j,
        examId: remap(j.examId),
        exerciseId: remap(j.exerciseId),
      }))
    );
  }

  if (Array.isArray(payload.examMcGroups) && payload.examMcGroups.length > 0) {
    await db.examMcGroups.bulkPut(
      payload.examMcGroups.map((g: any) => ({ ...g, examId: remap(g.examId) }))
    );
  }

  if (Array.isArray(payload.exerciseResources) && payload.exerciseResources.length > 0) {
    // The packer stored plaintext bytes as base64; re-encrypt them under this
    // session's key and follow the exercise id remapping, so a re-imported
    // exercise keeps its figures.
    for (const r of payload.exerciseResources) {
      const bytes = base64ToUint8Array(r.dataB64 ?? '');
      const record = await encryptResource(
        {
          id: r.id,
          exerciseId: remap(r.exerciseId) ?? r.exerciseId,
          filename: r.filename,
          mimeType: r.mimeType ?? 'application/octet-stream',
          byteSize: bytes.length,
          createdAt: r.createdAt,
        },
        bytes,
        activeKey
      );
      await db.exerciseResources.put(record);
    }
  }

  if (Array.isArray(payload.auditLogs) && payload.auditLogs.length > 0) {
    await db.auditLog.bulkPut(payload.auditLogs);
  }

  onProgress?.({ stage: 'complete', current: 100, total: 100 });

  return { examCount, studentCount, errors };
}
