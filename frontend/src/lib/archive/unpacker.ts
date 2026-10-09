/**
 * Import a .bgproj archive. `decryptArchive()` only opens the envelope (touches no tables, session or stores), so a wrong
 * password costs nothing; `applyArchive()` writes only after decryption succeeded and every conflict has a decision.
 * Never call `sessionStore.unlock()` with the archive key; records are re-encrypted under the live session key.
 */

import { get } from 'svelte/store';
import { db } from '#lib/db/db';
import { sessionStore } from '#lib/stores/session';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  type ProgressEvent,
} from './format';
import { deriveKey } from '#lib/crypto/keyDerivation';
import { deriveSessionKey } from '#lib/crypto/sessionKey';
import { api } from '#lib/api/client';
import { base64ToUint8Array, decrypt, encrypt, toArrayBuffer } from '#lib/crypto/aesGcm';
import {
  saveStudentEncrypted,
  saveSubmissionEncrypted,
  encryptAuditEntry,
  encryptExam,
  encryptExercise,
  encryptResource,
  encryptScore,
} from '#lib/db/dbEncryption';
import { scoreRepository, toApi as scoreToApi } from '#lib/repositories/scoreRepository';
import { studentServerPayload } from '#lib/repositories/studentRepository';
import { submissionServerPayload } from '#lib/repositories/submissionRepository';
import type { AuditEntry, ExerciseScoreRecord, SubmissionRecord } from '#lib/db/schema';
import { decodeBinary } from './binary';
import { importPayloadToServer } from './serverImport';
import { addMissing, bump, newReport, type ArchiveReport } from './report';
import { loadAccountLogoBytes, restoreExamLogo, type ArchivedExamLogo } from '#lib/latex/logo';

function describe(err: any): string {
  return err?.message ?? String(err);
}

/**
 * Re-seals an archived submission's scan and annotation under the live key. Current archives carry
 * them decrypted (`scanBytes`); older ones carried the exporter's ciphertext, which opens only when
 * the exporter was this very account; otherwise the scan is dropped and reported.
 */
async function resealScans(
  sub: any,
  key: CryptoKey,
  report: ArchiveReport,
  examLabel: string
): Promise<SubmissionRecord> {
  const { scanBytes, annotationBytes, ...rest } = sub;
  const record: SubmissionRecord = { ...rest };
  const seal = async (bytes: Uint8Array) => {
    const { ciphertext, iv } = await encrypt(key, bytes);
    return { ct: ciphertext, iv };
  };
  if (scanBytes instanceof Uint8Array) {
    const s = await seal(scanBytes);
    record.scanCt = s.ct;
    record.scanIv = s.iv;
  } else if (record.scanCt && record.scanIv) {
    try {
      await decrypt(key, record.scanCt, record.scanIv);
    } catch {
      record.scanCt = undefined;
      record.scanIv = undefined;
      // An archive from before scans travelled decrypted: sealed by another account, unreadable here.
      addMissing(report, { reason: 'scanUnreadable', exam: examLabel, item: sub.id });
    }
  }
  if (annotationBytes instanceof Uint8Array) {
    const a = await seal(annotationBytes);
    record.annotationCt = a.ct;
    record.annotationIv = a.iv;
  } else if (record.annotationCt && record.annotationIv) {
    try {
      await decrypt(key, record.annotationCt, record.annotationIv);
    } catch {
      record.annotationCt = undefined;
      record.annotationIv = undefined;
    }
  }
  return record;
}

export interface ImportResult {
  /** Exams written (created or under a new id). */
  examCount: number;
  /** Students written. */
  studentCount: number;
  errors: string[];
  report: ArchiveReport;
}

export interface ApplyOptions {
  report?: ArchiveReport;
  /** Exams this account owns already (from `detectConflicts`): results of kept exams go there. */
  ownExamIds?: Set<string>;
  /** Exercises the user chose to take from the archive over an existing one. */
  takeImportedIds?: Set<string>;
}

/** Opens the archive envelope and returns its payload. Read-only; the archive key never leaves this function. */
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
    return decodeBinary(JSON.parse(jsonStr)) as Record<string, any>;
  } catch {
    throw new Error('Corrupted archive: Payload is not valid JSON.');
  }
}

/** Writes a decrypted, already-resolved payload (output of `applyResolutions`, not the raw archive) into the current store. */
export async function applyArchive(
  payload: Record<string, any>,
  onProgress?: (event: ProgressEvent) => void,
  { report = newReport('import'), ownExamIds = new Set(), takeImportedIds }: ApplyOptions = {}
): Promise<ImportResult> {
  // Always the live session key, never the archive's — records arrive already
  // decrypted and only need re-sealing under this vault's key.
  const activeKey = get(sessionStore).sessionKey;
  if (!activeKey) {
    throw new Error('Unlock the session before importing an archive.');
  }

    // Exams and exercises are *created* under the importing account: saveExamEncrypted/
    // saveExerciseEncrypted go through repository.save(), which PATCHes ids the account doesn't own.
    // importPayloadToServer() creates them instead and reports id substitutions.
  const errors: string[] = [];
  let idMap = new Map<string, string>();
  // Filled by the server import so the local mirror uses the same group ids
  // the server created.
  let mcGroupIdMap = new Map<string, string>();

  const exams: any[] = Array.isArray(payload.exams) ? payload.exams : [];
  const exercises: any[] = Array.isArray(payload.exercises) ? payload.exercises : [];
  report.codeWithheld = payload.codeWithheld === true;
  const examLabel = new Map<string, string>(exams.map((e) => [e.id, e.title || e.id]));
  const labelOf = (examId: string) => examLabel.get(examId) ?? examId;
  const exerciseLabel = new Map<string, string>(exercises.map((e) => [e.id, e.name || e.title || e.id]));

  /** Rewrites an archived id to the id actually created on the server. */
  const remap = (id: string | undefined) => (id ? (idMap.get(id) ?? id) : id);

  const result = await importPayloadToServer(payload, { report, takeImportedIds });
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

  // Each created exam gets the header logo it was exported with (archives before payload
  // version 3 carry none, so their exams follow this account's logo).
  const examLogos: ArchivedExamLogo[] = Array.isArray(payload.examLogos) ? payload.examLogos : [];
  const logosToRestore = examLogos.filter((l) => result.createdExamIds.has(l.examId));
  if (logosToRestore.length > 0) {
    let accountLogo: Uint8Array | null = null;
    try {
      accountLogo = await loadAccountLogoBytes();
    } catch {
      // Unknown: treated as none, so archived logo files are pinned on their exams.
    }
    for (const logo of logosToRestore) {
      const examId = remap(logo.examId) ?? logo.examId;
      try {
        if (await restoreExamLogo(examId, logo, accountLogo)) bump(report, 'logos', 'created');
      } catch (err) {
        errors.push(`Logo of exam "${labelOf(logo.examId)}": ${describe(err)}`);
        addMissing(report, { reason: 'logoUnavailable', exam: labelOf(logo.examId) });
        bump(report, 'logos', 'failed');
      }
    }
  }

  // Submissions of an exam that got a fresh id get fresh ids too: their archived ids may belong to
  // another account's exam on this server (a 409 that used to vanish into the offline queue).
  // Submissions of an exam that kept its id keep theirs, so re-importing one's own backup upserts.
  const submissionIdMap = new Map<string, string>();
  for (const sub of Array.isArray(payload.submissions) ? payload.submissions : []) {
    if (remap(sub.examId) !== sub.examId) submissionIdMap.set(sub.id, crypto.randomUUID());
  }
  const remapSubmission = (id: string) => submissionIdMap.get(id) ?? id;
  const local = resultsAreLocal();

  // Results need an exam to belong to: one created by this import, or one the account already
  // has (a kept or identical exam). Results of an exam that failed to import have nowhere to go.
  const examAvailable = (archivedExamId: string) =>
    result.createdExamIds.has(archivedExamId) || ownExamIds.has(archivedExamId);
  const skipForMissingExam = (archivedExamId: string, what: string) => {
    if (examAvailable(archivedExamId)) return false;
    addMissing(report, { reason: 'examNotImported', exam: labelOf(archivedExamId), item: what });
    return true;
  };

  // Results go where the account keeps them: this browser in hybrid mode (through the
  // repositories), the server in all-server mode. Server writes are direct, so a rejection is
  // reported here instead of disappearing into the offline queue.
  if (Array.isArray(payload.students)) {
    for (const item of payload.students) {
      if (skipForMissingExam(item.examId, 'students')) continue;
      const student = { ...item, examId: remap(item.examId) };
      try {
        if (local) await saveStudentEncrypted(student, activeKey);
        else
          await api.post(`/exams/${student.examId}/students`, await studentServerPayload(student, activeKey), {
            silentError: true,
          });
        bump(report, 'students', 'created');
      } catch (err) {
        errors.push(`Student of exam ${labelOf(item.examId)}: ${describe(err)}`);
        bump(report, 'students', 'failed');
      }
    }
  }

  if (Array.isArray(payload.submissions)) {
    for (const item of payload.submissions) {
      if (skipForMissingExam(item.examId, 'submissions')) continue;
      const sub = await resealScans(
        { ...item, id: remapSubmission(item.id), examId: remap(item.examId) },
        activeKey,
        report,
        labelOf(item.examId)
      );
      try {
        if (local) await saveSubmissionEncrypted(sub, activeKey);
        else
          await api.post(`/exams/${sub.examId}/submissions`, await submissionServerPayload(sub), {
            silentError: true,
          });
        bump(report, 'submissions', 'created');
        if (sub.scanCt) bump(report, 'scans', 'created');
        if (sub.annotationCt) bump(report, 'annotations', 'created');
      } catch (err) {
        errors.push(`Submission ${sub.id}: ${describe(err)}`);
        bump(report, 'submissions', 'failed');
      }
    }
  }

  if (Array.isArray(payload.exerciseScores)) {
    // Scores are addressed per exam; the archive only records which submission
    // they belong to, so the exam id comes from that submission.
    const archivedExamBySubmission = new Map<string, string>();
    for (const sub of Array.isArray(payload.submissions) ? payload.submissions : []) {
      if (examAvailable(sub.examId)) archivedExamBySubmission.set(remapSubmission(sub.id), sub.examId);
    }

    const bySubmission = new Map<string, ExerciseScoreRecord[]>();
    for (const score of payload.exerciseScores) {
      const submissionId = remapSubmission(score.submissionId);
      const archivedExamId = archivedExamBySubmission.get(submissionId);
      // A score for an exercise this import could not link to its (new) exam would be refused by the
      // server for the whole submission; leave it out and say which exercise is missing.
      const linked = archivedExamId ? result.linkedExercisesByExam.get(archivedExamId) : undefined;
      if (archivedExamId && linked && !linked.has(score.exerciseId)) {
        addMissing(report, {
          reason: 'scoresWithoutExercise',
          exam: labelOf(archivedExamId),
          item: exerciseLabel.get(score.exerciseId) ?? score.exerciseId,
        });
        continue;
      }
      const record = {
        ...score,
        // Fresh row id with a fresh submission: score ids are global primary keys on the server.
        id: submissionId !== score.submissionId ? crypto.randomUUID() : score.id,
        submissionId,
        exerciseId: remap(score.exerciseId),
      };
      const bucket = bySubmission.get(record.submissionId);
      if (bucket) bucket.push(record);
      else bySubmission.set(record.submissionId, [record]);
    }

    for (const [submissionId, scores] of bySubmission) {
      const archivedExamId = archivedExamBySubmission.get(submissionId);
      const examId = archivedExamId ? remap(archivedExamId) : undefined;
      if (!examId) {
        errors.push(
          `${scores.length} score(s) reference submission ${submissionId}, which the ` +
            `archive does not contain or whose exam was not imported. They were skipped.`
        );
        bump(report, 'scores', 'failed', scores.length);
        continue;
      }
      try {
        if (local) await scoreRepository.saveMany(examId, submissionId, scores, activeKey);
        else {
          const sealed = await Promise.all(scores.map((sc) => encryptScore(sc, activeKey)));
          await api.put(
            `/exams/${examId}/submissions/${submissionId}/scores`,
            { scores: sealed.map(scoreToApi) },
            { silentError: true }
          );
        }
        bump(report, 'scores', 'created', scores.length);
      } catch (err) {
        errors.push(`Scores of submission ${submissionId}: ${describe(err)}`);
        bump(report, 'scores', 'failed', scores.length);
      }
    }
  }

    // MC groups before the junctions (which carry mcGroupId). A group whose exam got a fresh id needs
    // its own fresh id too, else re-importing into the source DB would rewrite the original exam's
    // groups. Both sides share one map, so membership survives.
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
    // Current archives carry the entries decrypted; re-seal them under this account's key. Entries
    // of older archives are still sealed under the exporter's key and only open for that account.
    const entries = await Promise.all(
      payload.auditLogs
        // An entry the exporter could not open carries no note worth sealing again.
        .filter((a: AuditEntry) => !a.decryptFailed)
        .map(async (a: AuditEntry) => (a.payloadCt ? a : encryptAuditEntry(a, activeKey)))
    );
    await db.auditLog.bulkPut(entries);
    bump(report, 'auditLogs', 'created', entries.length);
  }

  onProgress?.({ stage: 'complete', current: 100, total: 100 });

  report.problems.push(...errors);
  const examCount = (report.counts.exams?.created ?? 0) + (report.counts.exams?.newId ?? 0);
  const studentCount = report.counts.students?.created ?? 0;
  return { examCount, studentCount, errors, report };
}

/**
 * Decrypt and write in one call, without conflict resolution. For callers that can't present
 * conflicts (tests, imports into an empty workspace); user-facing imports use `archiveService.openBgprojArchive()`.
 */
export async function unpackProject(
  archiveData: Blob | ArrayBuffer | Uint8Array,
  password: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<ImportResult> {
  const payload = await decryptArchive(archiveData, password, onProgress);
  return applyArchive(payload, onProgress);
}
