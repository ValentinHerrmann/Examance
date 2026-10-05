/**
 * Export a .bgproj archive, encrypting records with a fresh Argon2id key from the export password.
 * Freshness invariant: a new 16-byte salt and 12-byte nonce MUST be generated on every pack
 * (ciphertext uniqueness, no key/nonce reuse or replay).
 */

import { get } from 'svelte/store';
import { db } from '#lib/db/db';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { examRepository } from '#lib/repositories/examRepository';
import { sessionStore } from '#lib/stores/session';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  SALT_OFFSET,
  NONCE_OFFSET,
  PAYLOAD_OFFSET,
  type ProgressCallback,
} from './format';
import { deriveKey, generateSalt } from '#lib/crypto/keyDerivation';
import { deriveSessionKey } from '#lib/crypto/sessionKey';
import { decrypt, encryptJson, uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import {
  loadExamsEncrypted,
  loadExercisesEncrypted,
  loadStudentsEncrypted,
  loadSubmissionsEncrypted,
  decryptAuditEntry,
  decryptResourceBytes,
} from '#lib/db/dbEncryption';
import type { ExerciseRecord, SubmissionRecord } from '#lib/db/schema';
import { encodeBinary } from './binary';
import { api } from '#lib/api/client';
import { mapApiToExerciseRecord } from '#lib/repositories/exerciseRepository';
import { addMissing, bump, newReport, type ArchiveReport } from './report';
import { exportExamLogo, type ArchivedExamLogo } from '#lib/latex/logo';

/**
 * Payload layout version: 2 added `$b64` bytes, decrypted scans, and `codeWithheld`; 3 added
 * `examLogos`. Older archives import with every exam following the importer's account logo.
 */
export const ARCHIVE_PAYLOAD_VERSION = 3;

export interface PackOptions {
  /**
   * Include the exercises' LaTeX and resource files (default). Off, the archive carries exams with
   * scans and results plus each exercise's name, points and answer key, but no code: a way to share
   * results with another teacher without handing over the exercises.
   */
  includeExerciseCode?: boolean;
}

/**
 * Scans and annotations are sealed under this account's key; another account could never open them.
 * Like resource files they travel decrypted inside the password envelope and are re-sealed on import.
 */
async function unsealScans(
  sub: SubmissionRecord,
  key: CryptoKey | null,
  report: ArchiveReport,
  examLabel: string
) {
  const { scanCt, scanIv, annotationCt, annotationIv, ...rest } = sub;
  // One unreadable scan must not fail the whole export: leave it out and say so.
  const open = async (ct?: Uint8Array, iv?: Uint8Array) => {
    if (!ct || !iv || !key) return undefined;
    try {
      return await decrypt(key, ct, iv);
    } catch {
      addMissing(report, { reason: 'scanUnreadable', exam: examLabel, item: sub.id });
      return undefined;
    }
  };
  const scanBytes = await open(scanCt, scanIv);
  const annotationBytes = await open(annotationCt, annotationIv);
  if (scanBytes) bump(report, 'scans', 'included');
  if (annotationBytes) bump(report, 'annotations', 'included');
  return { ...rest, scanBytes, annotationBytes };
}

/** An exercise an exam links but the library list lacks (an older version, a shared one). */
async function loadLinkedExercise(id: string): Promise<ExerciseRecord | null> {
  try {
    return mapApiToExerciseRecord(await api.get(`/exercises/${id}`, { silentError: true }));
  } catch {
    return null;
  }
}

export interface PackResult {
  blob: Blob;
  report: ArchiveReport;
}

function withoutCode(ex: ExerciseRecord): ExerciseRecord {
  return { ...ex, latexBody: undefined, codeWithheld: true };
}

export async function packProject(
  password: string,
  onProgress?: ProgressCallback,
  { includeExerciseCode = true }: PackOptions = {}
): Promise<PackResult> {
  const report = newReport('export');
  report.codeWithheld = !includeExerciseCode;
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

  // 2. Derive the fresh master key.
  const { masterKey } = await deriveKey(password, salt);

  // 3. Collect records from IDB
  const key = get(sessionStore).sessionKey;
  const exams = await loadExamsEncrypted(key);
  const library = await loadExercisesEncrypted(key);
  const students = await loadStudentsEncrypted(key);
  // The archive is the export/import bridge — it must carry every scan, not
  // just presence flags, so this is the one caller that opts into the heavy
  // list response.
  const submissions = await loadSubmissionsEncrypted(key, { includeScans: true });
  // Through the repository, not Dexie directly — in all-server mode the local
  // cache can be empty (e.g. right after a lock).
  const exerciseScores = await scoreRepository.getAll(exams.map((e) => e.id), key);
  // Decrypted like everything else: the importer re-seals them under its own key.
  const auditLogs = await Promise.all((await db.auditLog.toArray()).map((a) => decryptAuditEntry(a, key)));

  // Exercise links and MC groups, per exam, through the repository for the
  // same reason: the local Dexie tables can be empty in server-backed modes.
  const structures = await Promise.all(exams.map((e) => examRepository.getStructure(e.id)));
  const exerciseExams = structures.flatMap((s) => s.links);
  const examMcGroups = structures.flatMap((s) => s.mcGroups);
  const examLabel = new Map(exams.map((e) => [e.id, e.title || e.id]));

  // Every exercise an exported exam links must travel with it. The library list holds only current
  // versions (own and shared), so linked older versions are fetched one by one. A full export also
  // carries the rest of the library; a results-only export carries just the linked exercises.
  const libraryById = new Map(library.map((ex) => [ex.id, ex]));
  const linkedIds = [...new Set(exerciseExams.map((j) => j.exerciseId))];
  const linked: ExerciseRecord[] = [];
  for (const id of linkedIds) {
    const ex = libraryById.get(id) ?? (await loadLinkedExercise(id));
    if (ex) linked.push(ex);
    else {
      for (const j of exerciseExams.filter((l) => l.exerciseId === id)) {
        addMissing(report, {
          reason: 'exerciseUnavailable',
          exam: examLabel.get(j.examId) ?? j.examId,
          item: id,
        });
      }
    }
  }
  const linkedSet = new Set(linked.map((ex) => ex.id));
  const exercises = includeExerciseCode
    ? [...linked, ...library.filter((ex) => !linkedSet.has(ex.id))]
    : linked.map(withoutCode);

    // Resource files are decrypted with the session key and base64'd (JSON can't carry raw bytes);
    // the archive envelope protects them, and the importer re-encrypts under its own key.
  const exerciseResources = !includeExerciseCode ? [] : await Promise.all(
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

  // The header logo is part of the exam, so it travels in every archive, results-only included.
  // The bytes are what the exam printed, so the importer's own account logo cannot change it.
  const examLogos: ArchivedExamLogo[] = [];
  for (const exam of exams) {
    try {
      examLogos.push(await exportExamLogo(exam.id));
    } catch {
      addMissing(report, { reason: 'logoUnavailable', exam: examLabel.get(exam.id) ?? exam.id });
    }
  }

  onProgress?.({
    phase: 'encrypting',
    current: 30,
    total: 100,
    message: 'Encrypting database records...',
  });

    // 4. Students/submissions are archived as-is, no re-hashing: the payload is already sealed under
    // the archive key, and leaving the student/submission link field alone keeps round-trips lossless.
  const archivePayload = {
    payloadVersion: ARCHIVE_PAYLOAD_VERSION,
    codeWithheld: !includeExerciseCode,
    exams,
    exercises,
    students,
    submissions: await Promise.all(
      submissions.map((sub) => unsealScans(sub, key, report, examLabel.get(sub.examId) ?? sub.examId))
    ),
    exerciseScores,
    exerciseExams,
    examMcGroups,
    exerciseResources,
    examLogos,
    auditLogs,
  };

  // 5. Encrypt payload with fresh archive session key using header nonce as IV. Bytes are encoded
  // explicitly (`binary.ts`): plain JSON turned every Uint8Array into an unreadable object.
  const archiveSessionKey = await deriveSessionKey(masterKey, nonce);
  const encryptedPayload = await encryptJson(encodeBinary(archivePayload), archiveSessionKey, nonce);

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

  // What went in, and what deliberately did not.
  bump(report, 'exams', 'included', exams.length);
  bump(report, 'exercises', 'included', exercises.length);
  bump(report, 'mcGroups', 'included', examMcGroups.length);
  bump(report, 'students', 'included', students.length);
  bump(report, 'submissions', 'included', submissions.length);
  bump(report, 'scores', 'included', exerciseScores.length);
  bump(report, 'resources', 'included', exerciseResources.length);
  bump(report, 'logos', 'included', examLogos.filter((l) => l.bytes).length);
  bump(report, 'auditLogs', 'included', auditLogs.length);
  if (!includeExerciseCode) report.withheld.push('exerciseCode', 'resourceFiles');
  // Answer-sheet templates are rebuilt from the exercises when needed; they never travel.
  report.withheld.push('omrTemplates');

  return { blob: new Blob([fileBuffer], { type: 'application/octet-stream' }), report };
}
