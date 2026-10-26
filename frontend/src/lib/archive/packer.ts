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
} from '#lib/db/dbEncryption';
import type { ExerciseRecord, ExerciseResourceRecord, SubmissionRecord } from '#lib/db/schema';
import { exerciseResourceRepository } from '#lib/repositories/exerciseResourceRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { encodeBinary } from './binary';
import { api } from '#lib/api/client';
import { mapApiToExerciseRecord } from '#lib/repositories/exerciseRepository';
import { addMissing, bump, newReport, type ArchiveReport } from './report';
import { exportExamLogo, type ArchivedExamLogo } from '#lib/latex/logo';
import { getAccountPackages } from '#lib/latex/packageSettings';

/**
 * Payload layout version: 2 added `$b64` bytes, decrypted scans, and `codeWithheld`; 3 added
 * `examLogos`; 4 added `accountLatexPackages` on exams that follow their account (issue #108).
 * Older archives import with every exam following the importer's account logo and packages.
 */
export const ARCHIVE_PAYLOAD_VERSION = 4;

export interface PackOptions {
  /**
   * Include the exercises' LaTeX and resource files (default). Off, the archive carries exams with
   * scans and results plus each exercise's name, points and answer key, but no code: a way to share
   * results with another teacher without handing over the exercises.
   */
  includeExerciseCode?: boolean;
  /** Only these exams with their linked exercises and results (the exam page export); default: the whole workspace. */
  examIds?: string[];
}

/** Runs `fn` over `items` with at most `width` calls in flight; results keep the input order. */
async function mapPool<T, R>(items: T[], width: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]); // NOSONAR: sequential per worker is the point of the pool (bounded parallelism)
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}

/**
 * Resource files of the exported exercises, from the cache or the server (the cache alone lost
 * every figure in all-server mode, issue #145). An unreadable or empty file is reported, never packed.
 */
async function collectResources(
  exercises: ExerciseRecord[],
  key: CryptoKey | null,
  report: ArchiveReport,
  onProgress?: ProgressCallback
) {
  let done = 0;
  const perExercise = await mapPool(exercises, 4, async (ex) => {
    const label = ex.name || ex.title || ex.id;
    let rows: ExerciseResourceRecord[] = [];
    try {
      rows = await exerciseResourceRepository.listForExport(ex.id);
    } catch {
      addMissing(report, { reason: 'resourceUnavailable', exam: label });
    }
    // The files of one exercise load together; the pool above bounds how many exercises do.
    const bytesPerRow = await Promise.all(rows.map((r) => exerciseResourceRepository.getBytes(r, key).catch(() => null)));
    const files = rows.flatMap((r, i) => {
      const bytes = bytesPerRow[i];
      if (!bytes || bytes.length === 0) {
        addMissing(report, { reason: 'resourceUnavailable', exam: label, item: r.filename });
        return [];
      }
      // Base64 because JSON can't carry raw bytes; the archive envelope protects them.
      return [{
        id: r.id,
        exerciseId: ex.id,
        filename: r.filename,
        mimeType: r.mimeType,
        byteSize: bytes.length,
        createdAt: r.createdAt,
        dataB64: uint8ArrayToBase64(bytes),
      }];
    });
    done += 1;
    onProgress?.({
      phase: 'encrypting',
      current: 10 + Math.round((20 * done) / exercises.length),
      total: 100,
      message: 'Collecting exercise files...',
    });
    return files;
  });
  return perExercise.flat();
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

/**
 * Exams, library and results in the archive's scope: the whole workspace, or only `onlyExams` with their own results
 * (a single-exam archive carries the exercises those exams link, not the library). Scans are included: the archive is
 * the export/import bridge, so this is the one caller that opts into the heavy list response.
 */
async function loadScope(key: CryptoKey | null, onlyExams: Set<string> | null) {
  const allExams = await loadExamsEncrypted(key);
  if (!onlyExams) {
    return {
      exams: allExams,
      library: await loadExercisesEncrypted(key),
      students: await loadStudentsEncrypted(key),
      submissions: await loadSubmissionsEncrypted(key, { includeScans: true }),
    };
  }
  const exams = allExams.filter((e) => onlyExams.has(e.id));
  const perExam = <T>(load: (examId: string) => Promise<T[]>) => Promise.all(exams.map((e) => load(e.id))).then((r) => r.flat());
  return {
    exams,
    library: [] as ExerciseRecord[],
    students: await perExam((id) => studentRepository.getByExamId(id, key)),
    submissions: await perExam((id) => submissionRepository.getByExamId(id, key, { includeScans: true })),
  };
}

/** Decrypted like everything else (the importer re-seals them); a scoped archive keeps only entries about its records. */
async function loadAuditLogs(key: CryptoKey | null, targets: Set<string> | null) {
  const rows = (await db.auditLog.toArray()).filter((a) => !targets || (!!a.targetId && targets.has(a.targetId)));
  return Promise.all(rows.map((a) => decryptAuditEntry(a, key)));
}

function withoutCode(ex: ExerciseRecord): ExerciseRecord {
  return { ...ex, latexBody: undefined, codeWithheld: true };
}

export async function packProject(
  password: string,
  onProgress?: ProgressCallback,
  { includeExerciseCode = true, examIds }: PackOptions = {}
): Promise<PackResult> {
  const onlyExams = examIds ? new Set(examIds) : null;
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
  const { exams, library, students, submissions } = await loadScope(key, onlyExams);
  // Through the repository, not Dexie directly — in all-server mode the local
  // cache can be empty (e.g. right after a lock).
  const exerciseScores = await scoreRepository.getAll(exams.map((e) => e.id), key);
  // A single-exam archive keeps only entries about that exam, its students or its submissions.
  const auditTargets = onlyExams
    ? new Set<string>([...exams.map((e) => e.id), ...students.map((s) => s.pseudonymId), ...submissions.map((s) => s.id)])
    : null;
  const auditLogs = await loadAuditLogs(key, auditTargets);

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

  const exerciseResources = !includeExerciseCode ? [] : await collectResources(exercises, key, report, onProgress);

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
  // An exam that follows its account carries the account's packages, like the logo it printed.
  const accountPackages = await getAccountPackages();
  const archivePayload = {
    payloadVersion: ARCHIVE_PAYLOAD_VERSION,
    codeWithheld: !includeExerciseCode,
    exams: exams.map((exam) =>
      exam.latexPackages == null && accountPackages.length ? { ...exam, accountLatexPackages: accountPackages } : exam
    ),
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
