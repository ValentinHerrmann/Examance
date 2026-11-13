/** Import a .bgproj archive. `decryptArchive()` only opens the envelope (touches no tables, session or stores), so a wrong password costs nothing; `applyArchive()` writes only after decryption succeeded and every conflict has a decision. Never call `sessionStore.unlock()` with the archive key; records are re-encrypted under the live session key. */

import { samePackageLists, storedEntries } from '#lib/latex/packages';
import { getAccountPackages } from '#lib/latex/packageSettings';
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
import { deriveArgon2Key, derivePbkdf2Key } from '#lib/crypto/keyDerivation';
import { deriveSessionKey } from '#lib/crypto/sessionKey';
import { api } from '#lib/api/client';
import { toArrayBuffer } from '#lib/crypto/aesGcm';
import {
  saveStudentEncrypted,
  saveSubmissionEncrypted,
  encryptAuditEntry,
  encryptExam,
  encryptExercise,
  encryptReview,
  encryptScore,
  openAnnotation,
  openScan,
  sealAnnotation,
  sealScan,
} from '#lib/db/dbEncryption';
import { reviewRepository, toApi as reviewToApi } from '#lib/repositories/reviewRepository';
import { scoreRepository, toApi as scoreToApi } from '#lib/repositories/scoreRepository';
import { studentServerPayload } from '#lib/repositories/studentRepository';
import { submissionServerPayload } from '#lib/repositories/submissionRepository';
import type { AuditEntry, ExerciseScoreRecord, PseudonymVersion, SubmissionRecord } from '#lib/db/schema';
import { writeVersion } from '#lib/services/pseudonymRekey';
import { archiveKeyId, archivedPseudonym, importedPseudonym } from './pseudonyms';
import { decodeBinary } from './binary';
import { importPayloadToServer } from './serverImport';
import { remapPageBreaks } from '#lib/exam/pageBreaks';
import { addMissing, bump, newReport, type ArchiveReport } from './report';
import { refreshStatistics } from '#lib/analytics/statisticsSync';
import { remapSnapshot, type StatisticsSnapshot } from '#lib/analytics/statisticsSnapshot';
import { statisticsRepository } from '#lib/repositories/statisticsRepository';
import { loadAccountLogoBytes, restoreExamLogo, type ArchivedExamLogo } from '#lib/latex/logo';

function describe(err: any): string {
  return err?.message ?? String(err);
}

/** Re-seals an archived submission's scan and annotation under the live key. Current archives carry them decrypted (`scanBytes`); older ones carried the exporter's ciphertext, which opens only when the exporter was this very account; otherwise the scan is dropped and reported. */
async function resealScans(
  sub: any,
  key: CryptoKey,
  report: ArchiveReport,
  examLabel: string
): Promise<SubmissionRecord> {
  const { scanBytes, annotationBytes, ...rest } = sub;
  const record: SubmissionRecord = { ...rest };
  // Sealed under the submission's id after the remap: the ciphertext is bound to it (AAD, issue #178).
  if (scanBytes instanceof Uint8Array) {
    const s = await sealScan(record.id, scanBytes, key);
    record.scanCt = s.ct;
    record.scanIv = s.iv;
  } else if (record.scanCt && record.scanIv) {
    try {
      await openScan(record.id, record.scanCt, record.scanIv, key);
    } catch {
      record.scanCt = undefined;
      record.scanIv = undefined;
      // An archive from before scans travelled decrypted: sealed by another account, unreadable here.
      addMissing(report, { reason: 'scanUnreadable', exam: examLabel, item: sub.id });
    }
  }
  if (annotationBytes instanceof Uint8Array) {
    const a = await sealAnnotation(record.id, annotationBytes, key);
    record.annotationCt = a.ct;
    record.annotationIv = a.iv;
  } else if (record.annotationCt && record.annotationIv) {
    try {
      await openAnnotation(record.id, record.annotationCt, record.annotationIv, key);
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
  /** Conflict decisions by payload id (a copy's new id), so each record is counted once, as what it became. */
  decided?: Map<string, 'copied' | 'replaced'>;
}

/** An archive as a file, a buffer or bytes. */
type ArchiveData = Blob | ArrayBuffer | Uint8Array;

async function archiveToBuffer(archiveData: ArchiveData): Promise<ArrayBuffer> {
  if (archiveData instanceof ArrayBuffer) return archiveData;
  if (archiveData instanceof Uint8Array) return toArrayBuffer(archiveData);
  return archiveData.arrayBuffer();
}

/** Opens the archive envelope and returns its payload. Read-only; the archive key never leaves this function. */
export async function decryptArchive(
  archiveData: ArchiveData,
  password: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<Record<string, any>> {
  onProgress?.({ stage: 'salt', current: 0, total: 100 });

  const buffer = await archiveToBuffer(archiveData);
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

  // 4-5. Derive the key from header salt + password and authenticate the whole envelope. Archives are sealed with Argon2id; older ones may carry the PBKDF2 key of the former silent fallback (S14).
  let decompressedInner: Uint8Array | null = null;
  for (const derive of [deriveArgon2Key, derivePbkdf2Key]) {
    try {
      const { masterKey } = await derive(password, salt);
      const gcmKey = await deriveSessionKey(masterKey, nonce);
      decompressedInner = new Uint8Array(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(nonce) }, gcmKey, toArrayBuffer(ciphertext))
      );
      break;
    } catch {
      // Wrong password, or the other KDF.
    }
  }
  if (!decompressedInner) {
    throw new Error('Decryption failed: Incorrect password or corrupted archive payload.');
  }
  onProgress?.({ stage: 'encrypt', current: 40, total: 100 });

  onProgress?.({ stage: 'db_writes', current: 60, total: 100 });

  // 6. Parse payload JSON
  try {
    const jsonStr = new TextDecoder().decode(decompressedInner);
    return decodeBinary(JSON.parse(jsonStr)) as Record<string, any>;
  } catch {
    throw new Error('Corrupted archive: Payload is not valid JSON.');
  }
}

type Pseudonym = { pseudonymHmac: string; pseudonymVersion: PseudonymVersion };

const asList = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** What the write phases of `applyArchive` share; built after the server import because `remap` reads its id map. */
interface ApplyContext {
  payload: Record<string, any>;
  activeKey: CryptoKey;
  report: ArchiveReport;
  errors: string[];
  decided: Map<string, 'copied' | 'replaced'>;
  ownExamIds: Set<string>;
  result: Awaited<ReturnType<typeof importPayloadToServer>>;
  /** Rewrites an archived id to the id actually created on the server. */
  remap: (id: string | undefined) => string | undefined;
  labelOf: (examId: string) => string;
  /** Results go where the account keeps them: true in hybrid mode (through the repositories). */
  local: boolean;
}

/** Results need an exam to belong to: one created by this import, or one the account already has (a kept or identical exam). Results of an exam that failed to import have nowhere to go. */
function examAvailable(ctx: ApplyContext, archivedExamId: string): boolean {
  return ctx.result.createdExamIds.has(archivedExamId) || ctx.ownExamIds.has(archivedExamId);
}

function skipForMissingExam(ctx: ApplyContext, archivedExamId: string, what: string): boolean {
  if (examAvailable(ctx, archivedExamId)) return false;
  addMissing(ctx.report, { reason: 'examNotImported', exam: ctx.labelOf(archivedExamId), item: what });
  return true;
}

/** Exams that followed the exporting account keep its packages, unless this account has the same list. */
async function keepArchivedPackages(exams: any[]): Promise<void> {
  const ownPackages = await getAccountPackages();
  for (const exam of exams) {
    const archived = storedEntries(exam.accountLatexPackages);
    delete exam.accountLatexPackages;
    if (exam.latexPackages == null && archived.length && !samePackageLists(archived, ownPackages)) {
      exam.latexPackages = archived;
    }
  }
}

async function mirrorExam(ctx: ApplyContext, exam: any): Promise<void> {
  const { idMap, mcGroupIdMap } = ctx.result;
  const pageBreaks = remapPageBreaks(exam.pageBreaks, idMap, mcGroupIdMap);
  await db.exams.put(await encryptExam({ ...exam, id: ctx.remap(exam.id), pageBreaks }, ctx.activeKey));
}

async function mirrorExercise(ctx: ApplyContext, ex: any): Promise<void> {
  await db.exercises.put(
    await encryptExercise({ ...ex, id: ctx.remap(ex.id), examId: ctx.remap(ex.examId) }, ctx.activeKey)
  );
}

/** Mirrors the created exams and exercises into IndexedDB so the local cache is warm before the first refresh. */
async function mirrorToLocalCache(ctx: ApplyContext, exams: any[], exercises: any[]): Promise<void> {
  for (const exam of exams) {
    if (!ctx.result.createdExamIds.has(exam.id)) continue;
    await mirrorExam(ctx, exam); // NOSONAR: IndexedDB writes run in order
  }
  for (const ex of exercises) {
    if (!ctx.result.createdExerciseIds.has(ex.id)) continue;
    await mirrorExercise(ctx, ex); // NOSONAR: IndexedDB writes run in order
  }
}

async function restoreOneLogo(ctx: ApplyContext, logo: ArchivedExamLogo, accountLogo: Uint8Array | null): Promise<void> {
  const examId = ctx.remap(logo.examId) ?? logo.examId;
  try {
    if (await restoreExamLogo(examId, logo, accountLogo)) bump(ctx.report, 'logos', 'created');
  } catch (err) {
    ctx.errors.push(`Logo of exam "${ctx.labelOf(logo.examId)}": ${describe(err)}`);
    addMissing(ctx.report, { reason: 'logoUnavailable', exam: ctx.labelOf(logo.examId) });
    bump(ctx.report, 'logos', 'failed');
  }
}

/** Each created exam gets the header logo it was exported with (archives before payload version 3 carry none, so their exams follow this account's logo). */
async function restoreLogos(ctx: ApplyContext): Promise<void> {
  const examLogos: ArchivedExamLogo[] = Array.isArray(ctx.payload.examLogos) ? ctx.payload.examLogos : [];
  const logosToRestore = examLogos.filter((l) => ctx.result.createdExamIds.has(l.examId));
  if (logosToRestore.length === 0) return;
  let accountLogo: Uint8Array | null = null;
  try {
    accountLogo = await loadAccountLogoBytes();
  } catch {
    // Unknown: treated as none, so archived logo files are pinned on their exams.
  }
  for (const logo of logosToRestore) {
    await restoreOneLogo(ctx, logo, accountLogo); // NOSONAR: logo restores run in order
  }
}

/** Keyed pseudonyms belong to one exam of one account: re-key into the target exam, the same way for students and their submissions, so the two stay linked (issue #177). All computed up front, in parallel. */
async function rekeyPseudonyms(ctx: ApplyContext): Promise<Map<any, Pseudonym>> {
  const sameAccount = ctx.payload.keyId === archiveKeyId();
  const versions = new Map<string, Promise<PseudonymVersion>>();
  const versionOf = (examId: string) => {
    if (!versions.has(examId)) versions.set(examId, writeVersion(examId));
    return versions.get(examId)!;
  };
  const rekeyed = new Map<string, Promise<Pseudonym>>();
  const pseudonymOf = (item: any): Promise<Pseudonym> => {
    const archived = `${item.examId}:${archivedPseudonym(item).value}`;
    if (!rekeyed.has(archived)) {
      const examId = ctx.remap(item.examId) as string;
      // Kept only in the very exam it was keyed for: an exam imported as a copy has another key.
      const keyedFor = item.keyedExamId ?? item.examId;
      rekeyed.set(archived, versionOf(examId).then((v) => importedPseudonym(item, examId, v, sameAccount && examId === keyedFor)));
    }
    return rekeyed.get(archived)!;
  };
  const resultRows = [...asList(ctx.payload.students), ...asList(ctx.payload.submissions)].filter((item: any) =>
    examAvailable(ctx, item.examId)
  );
  return new Map<any, Pseudonym>(
    await Promise.all(resultRows.map(async (item: any) => [item, await pseudonymOf(item)] as const))
  );
}

async function importStudent(ctx: ApplyContext, item: any, pseudonyms: Map<any, Pseudonym>): Promise<void> {
  const { report, errors, decided, local, activeKey } = ctx;
  if (skipForMissingExam(ctx, item.examId, 'students')) return;
  const { pseudonymId: _legacy, ...archivedStudent } = item;
  const student = { ...archivedStudent, ...pseudonyms.get(item), examId: ctx.remap(item.examId) };
  try {
    if (local) await saveStudentEncrypted(student, activeKey);
    else
      await api.post(`/exams/${student.examId}/students`, await studentServerPayload(student, activeKey), {
        silentError: true,
      });
    bump(report, 'students', decided.get(`${item.examId}:${archivedPseudonym(item).value}`) ?? 'created');
  } catch (err) {
    errors.push(`Student of exam ${ctx.labelOf(item.examId)}: ${describe(err)}`);
    bump(report, 'students', 'failed');
  }
}

async function importSubmission(
  ctx: ApplyContext,
  item: any,
  pseudonyms: Map<any, Pseudonym>,
  remapSubmission: (id: string) => string
): Promise<void> {
  const { report, errors, decided, local, activeKey } = ctx;
  if (skipForMissingExam(ctx, item.examId, 'submissions')) return;
  const { pseudonymHash: _legacy, ...archivedSub } = item;
  const sub = await resealScans(
    { ...archivedSub, ...pseudonyms.get(item), id: remapSubmission(item.id), examId: ctx.remap(item.examId) },
    activeKey,
    report,
    ctx.labelOf(item.examId)
  );
  try {
    if (local) await saveSubmissionEncrypted(sub, activeKey);
    else
      await api.post(`/exams/${sub.examId}/submissions`, await submissionServerPayload(sub), {
        silentError: true,
      });
    bump(report, 'submissions', decided.get(item.id) ?? 'created');
    if (sub.scanCt) bump(report, 'scans', 'created');
    if (sub.annotationCt) bump(report, 'annotations', 'created');
  } catch (err) {
    errors.push(`Submission ${sub.id}: ${describe(err)}`);
    bump(report, 'submissions', 'failed');
  }
}

/** Scores grouped per (remapped) submission; one a server would refuse for want of a linked exercise is left out and reported. */
function groupScores(
  ctx: ApplyContext,
  remapSubmission: (id: string) => string,
  archivedExamBySubmission: Map<string, string>
): Map<string, ExerciseScoreRecord[]> {
  const exerciseLabel = new Map<string, string>(asList(ctx.payload.exercises).map((e) => [e.id, e.name || e.title || e.id]));
  const bySubmission = new Map<string, ExerciseScoreRecord[]>();
  for (const score of ctx.payload.exerciseScores) {
    const submissionId = remapSubmission(score.submissionId);
    const archivedExamId = archivedExamBySubmission.get(submissionId);
    // A score for an exercise this import could not link to its (new) exam would be refused by the server for the whole submission; leave it out and say which exercise is missing.
    const linked = archivedExamId ? ctx.result.linkedExercisesByExam.get(archivedExamId) : undefined;
    if (archivedExamId && linked && !linked.has(score.exerciseId)) {
      addMissing(ctx.report, {
        reason: 'scoresWithoutExercise',
        exam: ctx.labelOf(archivedExamId),
        item: exerciseLabel.get(score.exerciseId) ?? score.exerciseId,
      });
      continue;
    }
    const record = {
      ...score,
      // Fresh row id with a fresh submission: score ids are global primary keys on the server.
      id: submissionId !== score.submissionId ? crypto.randomUUID() : score.id,
      submissionId,
      exerciseId: ctx.remap(score.exerciseId),
    };
    const bucket = bySubmission.get(record.submissionId);
    if (bucket) bucket.push(record);
    else bySubmission.set(record.submissionId, [record]);
  }
  return bySubmission;
}

async function importScoreGroup(
  ctx: ApplyContext,
  archivedExamBySubmission: Map<string, string>,
  submissionId: string,
  scores: ExerciseScoreRecord[]
): Promise<void> {
  const { report, errors, local, activeKey } = ctx;
  const archivedExamId = archivedExamBySubmission.get(submissionId);
  const examId = archivedExamId ? ctx.remap(archivedExamId) : undefined;
  if (!examId) {
    errors.push(
      `${scores.length} score(s) reference submission ${submissionId}, which the ` +
        `archive does not contain or whose exam was not imported. They were skipped.`
    );
    bump(report, 'scores', 'failed', scores.length);
    return;
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

/** Review threads follow their submission (issue #226); one per submission, so a re-import upserts. */
async function importReviews(ctx: ApplyContext, remapSubmission: (id: string) => string, examOf: Map<string, string>): Promise<void> {
  const { report, errors, local, activeKey } = ctx;
  for (const review of asList(ctx.payload.gradingReviews)) {
    const submissionId = remapSubmission(review.submissionId);
    const archivedExamId = examOf.get(submissionId);
    if (!archivedExamId) {
      errors.push(`A grading review references submission ${review.submissionId}, which was not imported. It was skipped.`);
      bump(report, 'reviews', 'failed');
      continue;
    }
    const examId = ctx.remap(archivedExamId) ?? archivedExamId;
    const record = { ...review, submissionId, id: submissionId !== review.submissionId ? crypto.randomUUID() : review.id };
    try {
      if (local) await reviewRepository.save(examId, record, activeKey); // NOSONAR: one submission at a time
      else {
        const sealed = await encryptReview(record, activeKey); // NOSONAR: one submission at a time
        await api.put(`/exams/${examId}/submissions/${submissionId}/grading-review`, reviewToApi(sealed), { silentError: true }); // NOSONAR: one submission at a time
      }
      bump(report, 'reviews', 'created');
    } catch (err) {
      errors.push(`Grading review of submission ${submissionId}: ${describe(err)}`);
      bump(report, 'reviews', 'failed');
    }
  }
}

/** Students, submissions and scores go where the account keeps them: this browser in hybrid mode (through the repositories), the server in all-server mode. Server writes are direct, so a rejection is reported here instead of disappearing into the offline queue. */
async function importResults(ctx: ApplyContext): Promise<void> {
  const { payload } = ctx;
  // Submissions of an exam that got a fresh id get fresh ids too: their archived ids may belong to another account's exam on this server (a 409 that used to vanish into the offline queue). Submissions of an exam that kept its id keep theirs, so re-importing one's own backup upserts.
  const submissionIdMap = new Map<string, string>();
  for (const sub of asList(payload.submissions)) {
    if (ctx.remap(sub.examId) !== sub.examId) submissionIdMap.set(sub.id, crypto.randomUUID());
  }
  const remapSubmission = (id: string) => submissionIdMap.get(id) ?? id;
  const pseudonyms = await rekeyPseudonyms(ctx);

  for (const item of asList(payload.students)) {
    await importStudent(ctx, item, pseudonyms); // NOSONAR: rows are written one by one, in archive order
  }

  for (const item of asList(payload.submissions)) {
    await importSubmission(ctx, item, pseudonyms, remapSubmission); // NOSONAR: rows are written one by one, in archive order
  }

  if (!Array.isArray(payload.exerciseScores)) return;
  // Scores are addressed per exam; the archive only records which submission they belong to, so the exam id comes from that submission.
  const archivedExamBySubmission = new Map<string, string>();
  for (const sub of asList(payload.submissions)) {
    if (examAvailable(ctx, sub.examId)) archivedExamBySubmission.set(remapSubmission(sub.id), sub.examId);
  }
  const bySubmission = groupScores(ctx, remapSubmission, archivedExamBySubmission);
  for (const [submissionId, scores] of bySubmission) {
    await importScoreGroup(ctx, archivedExamBySubmission, submissionId, scores); // NOSONAR: one submission at a time
  }
  await importReviews(ctx, remapSubmission, archivedExamBySubmission);
}

/** MC groups before the junctions (which carry mcGroupId). A group whose exam got a fresh id needs its own fresh id too, else re-importing into the source DB would rewrite the original exam's groups. Both sides share one map, so membership survives. */
async function mirrorExamStructure(ctx: ApplyContext): Promise<void> {
  const { payload, remap } = ctx;
  const { mcGroupIdMap } = ctx.result;
  if (Array.isArray(payload.examMcGroups) && payload.examMcGroups.length > 0) {
    const groupRecords = payload.examMcGroups.map((g: any) => {
      const remappedExamId = remap(g.examId);
      // In server-backed modes the id is whatever the server minted; locally, a fresh one only when the exam itself was remapped.
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
}

/** Current archives carry the entries decrypted; re-seal them under this account's key. Entries of older archives are still sealed under the exporter's key and only open for that account. */
async function importAuditLogs(ctx: ApplyContext): Promise<void> {
  const { payload, activeKey, report } = ctx;
  if (!Array.isArray(payload.auditLogs) || payload.auditLogs.length === 0) return;
  const entries = await Promise.all(
    payload.auditLogs
      // An entry the exporter could not open carries no note worth sealing again.
      .filter((a: AuditEntry) => !a.decryptFailed)
      .map(async (a: AuditEntry) => (a.payloadCt ? a : encryptAuditEntry(a, activeKey)))
  );
  await db.auditLog.bulkPut(entries);
  bump(report, 'auditLogs', 'created', entries.length);
}

/** Writes a decrypted, already-resolved payload (output of `applyResolutions`, not the raw archive) into the current store. */
export async function applyArchive(
  payload: Record<string, any>,
  onProgress?: (event: ProgressEvent) => void,
  { report = newReport('import'), ownExamIds = new Set(), decided = new Map() }: ApplyOptions = {}
): Promise<ImportResult> {
  // Always the live session key, never the archive's — records arrive already decrypted and only need re-sealing under this vault's key.
  const activeKey = get(sessionStore).sessionKey;
  if (!activeKey) {
    throw new Error('Unlock the session before importing an archive.');
  }

  // Exams and exercises are *created* under the importing account: saveExamEncrypted/ saveExerciseEncrypted go through repository.save(), which PATCHes ids the account doesn't own. importPayloadToServer() creates them instead and reports id substitutions.
  const errors: string[] = [];

  const exams: any[] = Array.isArray(payload.exams) ? payload.exams : [];
  const exercises: any[] = Array.isArray(payload.exercises) ? payload.exercises : [];
  report.codeWithheld = payload.codeWithheld === true;
  const examLabel = new Map<string, string>(exams.map((e) => [e.id, e.title || e.id]));

  await keepArchivedPackages(exams);

  const result = await importPayloadToServer(payload, { report, decided });
  errors.push(...result.errors);

  const ctx: ApplyContext = {
    payload,
    activeKey,
    report,
    errors,
    decided,
    ownExamIds,
    result,
    remap: (id) => (id ? (result.idMap.get(id) ?? id) : id),
    labelOf: (examId) => examLabel.get(examId) ?? examId,
    local: resultsAreLocal(),
  };

  await mirrorToLocalCache(ctx, exams, exercises);
  await restoreLogos(ctx);
  await importResults(ctx);
  await mirrorExamStructure(ctx);
  // Resource files live on the server only (uploaded by `importPayloadToServer`). A local copy would hide the server's set, since resource reads are local-first (issue #145).
  await importAuditLogs(ctx);

  await importStatistics(payload, (id) => examAvailable(ctx, id), ctx.remap, activeKey, errors);

  onProgress?.({ stage: 'complete', current: 100, total: 100 });

  report.problems.push(...errors);
  const examCount = (report.counts.exams?.created ?? 0) + (report.counts.exams?.newId ?? 0);
  const studentCount = report.counts.students?.created ?? 0;
  return { examCount, studentCount, errors, report };
}

/** Decrypt and write in one call, without conflict resolution. For callers that can't present conflicts (tests, imports into an empty workspace); user-facing imports use `archiveService.openBgprojArchive()`. */
/** Statistics of the imported exams (issue #238): rebuilt from imported results once, else the archived anonymous record stands in. */
async function importStatistics(
  payload: any,
  examAvailable: (archivedExamId: string) => boolean,
  remap: (id: string | undefined) => string | undefined,
  key: CryptoKey | null,
  errors: string[],
): Promise<void> {
  const withResults = new Set<string>((Array.isArray(payload.submissions) ? payload.submissions : []).map((s: any) => s.examId));
  const archived = new Map<string, StatisticsSnapshot>((Array.isArray(payload.examStatistics) ? payload.examStatistics : []).map((r: StatisticsSnapshot) => [r.exam?.id, r]));
  const examIds = new Set<string>([...withResults, ...archived.keys()]);
  for (const archivedExamId of examIds) {
    const examId = remap(archivedExamId);
    if (!examId || !examAvailable(archivedExamId)) continue;
    try {
      const snapshot = archived.get(archivedExamId);
      // In hybrid the result writes went through the repositories, whose dirty signal rebuilds the record; server-mode writes here are direct, so rebuild once.
      if (withResults.has(archivedExamId)) {
        if (!resultsAreLocal()) await refreshStatistics(examId); // NOSONAR: one exam at a time
      } else if (snapshot) await statisticsRepository.put(remapSnapshot(snapshot, examId, (id) => remap(id) ?? id), key); // NOSONAR: as above
    } catch (err) {
      errors.push(`Statistics of exam ${archivedExamId}: ${describe(err)}`);
    }
  }
}

export async function unpackProject(
  archiveData: ArchiveData,
  password: string,
  onProgress?: (event: ProgressEvent) => void
): Promise<ImportResult> {
  const payload = await decryptArchive(archiveData, password, onProgress);
  return applyArchive(payload, onProgress);
}
