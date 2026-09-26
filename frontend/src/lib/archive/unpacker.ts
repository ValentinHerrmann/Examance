/**
 * Import a .bgproj archive.
 *
 * Split in two: `decryptArchive()` only opens the envelope — no tables, no
 * session, no stores touched — so a wrong password costs nothing.
 * `applyArchive()` writes, and only once decryption succeeded and every
 * conflict has a decision. Never call `sessionStore.unlock()` with the
 * archive key; records are re-encrypted under the live session key.
 */

import { get } from 'svelte/store';
import { db } from '$lib/db/db';
import { sessionStore } from '$lib/stores/session';
import { storagePolicyStore } from '$lib/stores/storagePolicy';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  type ProgressEvent,
} from './format';
import { deriveKey } from '$lib/crypto/keyDerivation';
import { deriveSessionKey } from '$lib/crypto/sessionKey';
import { base64ToUint8Array, toArrayBuffer } from '$lib/crypto/aesGcm';
import {
  saveExamEncrypted,
  saveExerciseEncrypted,
  saveStudentEncrypted,
  saveSubmissionEncrypted,
  encryptExam,
  encryptExercise,
  encryptResource,
} from '$lib/db/dbEncryption';
import { scoreRepository } from '$lib/repositories/scoreRepository';
import type { ExerciseScoreRecord } from '$lib/db/schema';
import { importPayloadToServer } from './serverImport';

export interface ImportResult {
  examCount: number;
  studentCount: number;
  errors: string[];
}

/**
 * Opens the archive envelope and returns its payload. Read-only: no table or
 * store is touched, and the archive key never leaves this function.
 */
export async function decryptArchive(
  archiveData: Blob | ArrayBuffer | Uint8Array,
  password: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<Record<string, any>> {
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
  try {
    const jsonStr = new TextDecoder().decode(decompressedInner);
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Corrupted archive: Payload is not valid JSON.');
  }
}

/**
 * Writes an already-decrypted, already-resolved payload into the current store.
 *
 * @param payload the output of `applyResolutions`, not the raw archive.
 */
export async function applyArchive(
  payload: Record<string, any>,
  onProgress?: (event: ProgressEvent) => void
): Promise<ImportResult> {
  // Always the live session key, never the archive's — records arrive already
  // decrypted and only need re-sealing under this vault's key.
  const activeKey = get(sessionStore).sessionKey;
  if (!activeKey) {
    throw new Error('Unlock the session before importing an archive.');
  }

  // Persist the archive contents.
  //
  // In server-backed modes the exam/exercise records must be *created* under the
  // importing account: saveExamEncrypted/saveExerciseEncrypted route through
  // examRepository.save()/exerciseRepository.save(), which PATCH an id the
  // account does not own and never write IndexedDB. importPayloadToServer()
  // creates them instead and reports any id substitutions it had to make.
  const isServerBacked = get(storagePolicyStore).storageMode !== 'all-local';
  const errors: string[] = [];
  let idMap = new Map<string, string>();
  // Filled by the server import so the local mirror uses the same group ids
  // the server created.
  let mcGroupIdMap = new Map<string, string>();

  const exams: any[] = Array.isArray(payload.exams) ? payload.exams : [];
  const exercises: any[] = Array.isArray(payload.exercises) ? payload.exercises : [];
  const examCount = exams.length;
  const studentCount = Array.isArray(payload.students) ? payload.students.length : 0;

  /** Rewrites an archived id to the id actually created on the server. */
  const remap = (id: string | undefined) => (id ? (idMap.get(id) ?? id) : id);

  if (isServerBacked) {
    const result = await importPayloadToServer(payload);
    idMap = result.idMap;
    mcGroupIdMap = result.mcGroupIdMap;
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

  if (Array.isArray(payload.exerciseScores)) {
    // Scores are addressed per exam; the archive only records which submission
    // they belong to, so the exam id comes from that submission.
    const examIdBySubmission = new Map<string, string>();
    for (const sub of Array.isArray(payload.submissions) ? payload.submissions : []) {
      examIdBySubmission.set(sub.id, remap(sub.examId) ?? sub.examId);
    }

    const bySubmission = new Map<string, ExerciseScoreRecord[]>();
    for (const score of payload.exerciseScores) {
      const record = { ...score, exerciseId: remap(score.exerciseId) };
      const bucket = bySubmission.get(record.submissionId);
      if (bucket) bucket.push(record);
      else bySubmission.set(record.submissionId, [record]);
    }

    for (const [submissionId, scores] of bySubmission) {
      const examId = examIdBySubmission.get(submissionId);
      if (!examId) {
        errors.push(
          `${scores.length} score(s) reference submission ${submissionId}, which the ` +
            `archive does not contain. They were skipped.`
        );
        continue;
      }
      await scoreRepository.saveMany(examId, submissionId, scores, activeKey);
    }
  }

  // MC groups before the junctions: the junctions carry mcGroupId, and a group
  // whose exam was remapped onto a fresh id needs a fresh id of its own —
  // otherwise re-importing an archive into the DB it came from would rewrite
  // the original exam's groups. Both sides use the same map, so membership
  // survives the remapping.
  if (Array.isArray(payload.examMcGroups) && payload.examMcGroups.length > 0) {
    const groupRecords = payload.examMcGroups.map((g: any) => {
      const remappedExamId = remap(g.examId);
      // In server-backed modes the id is whatever the server minted; locally,
      // a fresh one only when the exam itself was remapped.
      const groupId =
        mcGroupIdMap.get(g.id) ?? (remappedExamId === g.examId ? g.id : crypto.randomUUID());
      if (groupId !== g.id) mcGroupIdMap.set(g.id, groupId);
      return { ...g, id: groupId, examId: remappedExamId };
    });
    await db.examMcGroups.bulkPut(groupRecords);
  }

  if (Array.isArray(payload.exerciseExams) && payload.exerciseExams.length > 0) {
    await db.examExercises.bulkPut(
      payload.exerciseExams.map((j: any) => ({
        ...j,
        examId: remap(j.examId),
        exerciseId: remap(j.exerciseId),
        mcGroupId: j.mcGroupId ? (mcGroupIdMap.get(j.mcGroupId) ?? j.mcGroupId) : undefined,
      }))
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

/**
 * Decrypt and write in one call, with no conflict resolution. Kept for
 * callers with no way to present conflicts (tests, imports into an empty
 * workspace); user-facing imports should go through
 * `archiveService.openBgprojArchive()`.
 */
export async function unpackProject(
  archiveData: Blob | ArrayBuffer | Uint8Array,
  password: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<ImportResult> {
  const payload = await decryptArchive(archiveData, password, onProgress);
  return applyArchive(payload, onProgress);
}
