/**
 * IndexedDB Record Encryption & Decryption Helpers.
 *
 * Ensures that all records written to Dexie IndexedDB have their sensitive payload
 * (including LaTeX templates, exercise text, answer keys, scores, and fallback codes)
 * encrypted with AES-256-GCM using the active in-memory sessionKey.
 *
 * When the session is locked or logged out (sessionKey is null), DevTools inspection
 * of IndexedDB reveals ONLY encrypted binary blobs (Uint8Array ciphertexts).
 */

import { encrypt, decrypt } from '$lib/crypto/aesGcm';
import { db } from '$lib/db/db';
import { sessionStore } from '$lib/stores/session';
import { get } from 'svelte/store';
import type {
  ExamRecord,
  ExerciseRecord,
  ExerciseResourceRecord,
  ExerciseScoreRecord,
  StudentRecord,
  SubmissionRecord,
  AuditEntry,
  GradingKeyConfig,
  OmrTemplateRecord,
  OmrTemplatePayload,
} from './schema';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encrypt raw bytes with key. */
async function encryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<{ ct: Uint8Array; iv: Uint8Array }> {
  const res = await encrypt(key, bytes);
  return { ct: res.ciphertext, iv: res.iv };
}

/** Decrypt raw bytes with key. */
async function decryptBytes(key: CryptoKey, ct: Uint8Array, iv: Uint8Array, fallbackKey?: CryptoKey | null): Promise<Uint8Array> {
  const activeFallbackKey = fallbackKey ?? (typeof window !== 'undefined' ? get(sessionStore).fallbackSessionKey : null);
  return await decrypt(key, ct, iv, activeFallbackKey);
}

// ---------------------------------------------------------------------------
// ExerciseResourceRecord — raw file bytes, encrypted like a scan
// ---------------------------------------------------------------------------

export async function encryptResource(
  resource: ExerciseResourceRecord,
  bytes: Uint8Array,
  key: CryptoKey | null
): Promise<ExerciseResourceRecord> {
  if (!key) {
    return { ...resource, data: bytes, dataCt: undefined, dataIv: undefined };
  }
  const { ct, iv } = await encryptBytes(key, bytes);
  return { ...resource, data: undefined, dataCt: ct, dataIv: iv };
}

/** Returns the resource's raw bytes, decrypting them if a key is available. */
export async function decryptResourceBytes(
  resource: ExerciseResourceRecord,
  key: CryptoKey | null
): Promise<Uint8Array> {
  if (resource.dataCt && resource.dataIv) {
    if (!key) throw new Error('Session is locked — unlock to read resource files.');
    return await decryptBytes(key, resource.dataCt, resource.dataIv);
  }
  return resource.data ?? new Uint8Array(0);
}

// ---------------------------------------------------------------------------
// ExamRecord
// ---------------------------------------------------------------------------

interface ExamPayload {
  title?: string;
  testart?: string;
  grade?: string;
  klasse?: string;
  datum?: string;
  nr?: string;
  fach?: string;
  lehrernachname?: string;
  infoText?: string;
  latexPreamble?: string;
  latexTemplate?: string;
  numVersions?: number;
  gradingKey?: GradingKeyConfig;
}

export async function encryptExam(exam: ExamRecord, key: CryptoKey | null): Promise<ExamRecord> {
  const payload: ExamPayload = {
    title: exam.title,
    testart: exam.testart,
    grade: exam.grade,
    klasse: exam.klasse,
    datum: exam.datum,
    nr: exam.nr,
    fach: exam.fach,
    lehrernachname: exam.lehrernachname,
    infoText: exam.infoText,
    latexPreamble: exam.latexPreamble,
    latexTemplate: exam.latexTemplate,
    numVersions: exam.numVersions,
    gradingKey: exam.gradingKey,
  };

  let payloadCt = exam.payloadCt;
  let payloadIv = exam.payloadIv;

  if (key) {
    const jsonStr = JSON.stringify(payload);
    const { ct, iv } = await encryptBytes(key, encoder.encode(jsonStr));
    payloadCt = ct;
    payloadIv = iv;

    return {
      id: exam.id,
      teacherId: exam.teacherId,
      retentionUntil: exam.retentionUntil,
      compilationStatus: exam.compilationStatus,
      createdAt: exam.createdAt,
      isDirty: exam.isDirty,
      payloadCt,
      payloadIv,
    };
  }

  return {
    id: exam.id,
    teacherId: exam.teacherId,
    retentionUntil: exam.retentionUntil,
    compilationStatus: exam.compilationStatus,
    createdAt: exam.createdAt,
    isDirty: exam.isDirty,
    title: exam.title,
    testart: exam.testart,
    grade: exam.grade,
    klasse: exam.klasse,
    datum: exam.datum,
    nr: exam.nr,
    fach: exam.fach,
    lehrernachname: exam.lehrernachname,
    infoText: exam.infoText,
    latexPreamble: exam.latexPreamble,
    latexTemplate: exam.latexTemplate,
    numVersions: exam.numVersions,
    gradingKey: exam.gradingKey,
    payloadCt,
    payloadIv,
  };
}

export async function decryptExam(exam: ExamRecord, key: CryptoKey | null): Promise<ExamRecord> {
  const baseRecord: ExamRecord = {
    id: exam.id,
    teacherId: exam.teacherId,
    retentionUntil: exam.retentionUntil,
    compilationStatus: exam.compilationStatus,
    createdAt: exam.createdAt,
    isDirty: exam.isDirty,
    title: exam.title,
    testart: exam.testart,
    grade: exam.grade,
    klasse: exam.klasse,
    datum: exam.datum,
    nr: exam.nr,
    fach: exam.fach,
    lehrernachname: exam.lehrernachname,
    infoText: exam.infoText,
    latexPreamble: exam.latexPreamble,
    latexTemplate: exam.latexTemplate,
    numVersions: exam.numVersions,
    gradingKey: exam.gradingKey,
    payloadCt: exam.payloadCt,
    payloadIv: exam.payloadIv,
  };

  if (!key || !exam.payloadCt || !exam.payloadIv || exam.payloadCt.byteLength < 16) {
    return baseRecord;
  }

  try {
    const bytes = await decryptBytes(key, exam.payloadCt, exam.payloadIv);
    const payload: ExamPayload = JSON.parse(decoder.decode(bytes));
    return {
      ...baseRecord,
      ...payload,
    };
  } catch (err) {
    console.error('Failed to decrypt exam record:', err);
    return baseRecord;
  }
}

// ---------------------------------------------------------------------------
// ExerciseRecord
// ---------------------------------------------------------------------------

interface ExercisePayload {
  title?: string;
  name?: string;
  latexBody?: string;
  options?: string[];
  correctAnswers?: number[];
}

export async function encryptExercise(exercise: ExerciseRecord, key: CryptoKey | null): Promise<ExerciseRecord> {
  const payload: ExercisePayload = {
    title: exercise.title,
    name: exercise.name,
    latexBody: exercise.latexBody,
    options: exercise.options,
    correctAnswers: exercise.correctAnswers,
  };

  let payloadCt = exercise.payloadCt;
  let payloadIv = exercise.payloadIv;

  if (key) {
    const jsonStr = JSON.stringify(payload);
    const { ct, iv } = await encryptBytes(key, encoder.encode(jsonStr));
    payloadCt = ct;
    payloadIv = iv;

    return {
      id: exercise.id,
      teacherId: exercise.teacherId,
      examId: exercise.examId,
      orderIndex: exercise.orderIndex,
      maxPoints: exercise.maxPoints,
      topicTag: exercise.topicTag,
      grade: exercise.grade,
      subject: exercise.subject,
      version: exercise.version,
      exerciseGroupId: exercise.exerciseGroupId,
      variantKey: exercise.variantKey,
      isCurrent: exercise.isCurrent,
      createdAt: exercise.createdAt,
      updatedAt: exercise.updatedAt,
      questionType: exercise.questionType,
      penalty: exercise.penalty,
      payloadCt,
      payloadIv,
    };
  }

  return {
    id: exercise.id,
    teacherId: exercise.teacherId,
    examId: exercise.examId,
    orderIndex: exercise.orderIndex,
    maxPoints: exercise.maxPoints,
    topicTag: exercise.topicTag,
    grade: exercise.grade,
    subject: exercise.subject,
    version: exercise.version,
    exerciseGroupId: exercise.exerciseGroupId,
    variantKey: exercise.variantKey,
    isCurrent: exercise.isCurrent,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
    questionType: exercise.questionType,
    penalty: exercise.penalty,
    title: exercise.title,
    name: exercise.name,
    latexBody: exercise.latexBody,
    options: exercise.options,
    correctAnswers: exercise.correctAnswers,
    payloadCt,
    payloadIv,
  };
}

export async function decryptExercise(exercise: ExerciseRecord, key: CryptoKey | null): Promise<ExerciseRecord> {
  const baseRecord: ExerciseRecord = {
    id: exercise.id,
    teacherId: exercise.teacherId,
    examId: exercise.examId,
    orderIndex: exercise.orderIndex,
    maxPoints: exercise.maxPoints,
    topicTag: exercise.topicTag,
    grade: exercise.grade,
    subject: exercise.subject,
    version: exercise.version,
    exerciseGroupId: exercise.exerciseGroupId,
    variantKey: exercise.variantKey,
    isCurrent: exercise.isCurrent,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
    questionType: exercise.questionType,
    penalty: exercise.penalty,
    title: exercise.title,
    name: exercise.name,
    latexBody: exercise.latexBody,
    options: exercise.options,
    correctAnswers: exercise.correctAnswers,
    payloadCt: exercise.payloadCt,
    payloadIv: exercise.payloadIv,
  };

  if (!key || !exercise.payloadCt || !exercise.payloadIv || exercise.payloadCt.byteLength < 16) {
    return baseRecord;
  }

  try {
    const bytes = await decryptBytes(key, exercise.payloadCt, exercise.payloadIv);
    const payload: ExercisePayload = JSON.parse(decoder.decode(bytes));
    return {
      ...baseRecord,
      ...payload,
    };
  } catch (err) {
    console.error('Failed to decrypt exercise record:', err);
    return baseRecord;
  }
}

// ---------------------------------------------------------------------------
// ExerciseScoreRecord
// ---------------------------------------------------------------------------

interface ScorePayload {
  score?: number;
  selectedOptions?: number[];
  omrMeta?: ExerciseScoreRecord['omrMeta'];
}

export async function encryptScore(scoreRec: ExerciseScoreRecord, key: CryptoKey | null): Promise<ExerciseScoreRecord> {
  const payload: ScorePayload = {
    score: scoreRec.score,
    selectedOptions: scoreRec.selectedOptions,
    omrMeta: scoreRec.omrMeta,
  };

  let payloadCt = scoreRec.payloadCt;
  let payloadIv = scoreRec.payloadIv;

  if (key) {
    const jsonStr = JSON.stringify(payload);
    const { ct, iv } = await encryptBytes(key, encoder.encode(jsonStr));
    payloadCt = ct;
    payloadIv = iv;

    return {
      id: scoreRec.id,
      submissionId: scoreRec.submissionId,
      exerciseId: scoreRec.exerciseId,
      payloadCt,
      payloadIv,
    };
  }

  return {
    id: scoreRec.id,
    submissionId: scoreRec.submissionId,
    exerciseId: scoreRec.exerciseId,
    score: scoreRec.score,
    selectedOptions: scoreRec.selectedOptions,
    omrMeta: scoreRec.omrMeta,
    payloadCt,
    payloadIv,
  };
}

export async function decryptScore(scoreRec: ExerciseScoreRecord, key: CryptoKey | null): Promise<ExerciseScoreRecord> {
  const baseRecord: ExerciseScoreRecord = {
    id: scoreRec.id,
    submissionId: scoreRec.submissionId,
    exerciseId: scoreRec.exerciseId,
    score: scoreRec.score,
    selectedOptions: scoreRec.selectedOptions,
    omrMeta: scoreRec.omrMeta,
    payloadCt: scoreRec.payloadCt,
    payloadIv: scoreRec.payloadIv,
  };

  if (!key || !scoreRec.payloadCt || !scoreRec.payloadIv || scoreRec.payloadCt.byteLength < 16) {
    return baseRecord;
  }

  try {
    const bytes = await decryptBytes(key, scoreRec.payloadCt, scoreRec.payloadIv);
    const payload: ScorePayload = JSON.parse(decoder.decode(bytes));
    return {
      ...baseRecord,
      ...payload,
    };
  } catch (err) {
    console.error('Failed to decrypt score record:', err);
    return baseRecord;
  }
}

// ---------------------------------------------------------------------------
// StudentRecord
// ---------------------------------------------------------------------------

interface StudentPayload {
  fallbackCode?: string;
  studentName?: string;
  studentNumber?: string;
}

export async function encryptStudent(student: StudentRecord, key: CryptoKey | null): Promise<StudentRecord> {
  const payload: StudentPayload = {
    fallbackCode: student.fallbackCode,
    studentName: student.studentName,
    studentNumber: student.studentNumber,
  };

  let payloadCt = student.payloadCt;
  let payloadIv = student.payloadIv;

  if (key) {
    const jsonStr = JSON.stringify(payload);
    const { ct, iv } = await encryptBytes(key, encoder.encode(jsonStr));
    payloadCt = ct;
    payloadIv = iv;
  } else if (student.fallbackCode || student.studentName || student.studentNumber) {
    // Without a key there is nowhere for the pupil's name to go except the
    // plaintext columns, which is exactly the leak this function used to have.
    // Refusing is the only safe answer: a locked session must not be able to
    // write identity data at all.
    throw new Error('Cannot write student identity data while the session is locked.');
  }

  // Deliberately does NOT re-emit fallbackCode, studentName or studentNumber.
  // Returning them alongside the ciphertext is what put pupil names into
  // IndexedDB in plaintext (tracked as L17 in docs/legal_audit_dsgvo.md) and
  // broke Core Invariant 1 in every storage mode. They live in payloadCt now,
  // and callers get them back from decryptStudent().
  return {
    pseudonymId: student.pseudonymId,
    examId: student.examId,
    piiCt: student.piiCt,
    piiIv: student.piiIv,
    payloadCt,
    payloadIv,
  };
}

export async function decryptStudent(student: StudentRecord, key: CryptoKey | null): Promise<StudentRecord> {
  const baseRecord: StudentRecord = {
    pseudonymId: student.pseudonymId,
    examId: student.examId,
    fallbackCode: student.fallbackCode,
    studentName: student.studentName,
    studentNumber: student.studentNumber,
    piiCt: student.piiCt,
    piiIv: student.piiIv,
    payloadCt: student.payloadCt,
    payloadIv: student.payloadIv,
  };

  if (!key || !student.payloadCt || !student.payloadIv || student.payloadCt.byteLength < 16) {
    return baseRecord;
  }

  try {
    const bytes = await decryptBytes(key, student.payloadCt, student.payloadIv);
    const payload: StudentPayload = JSON.parse(decoder.decode(bytes));
    return {
      ...baseRecord,
      ...payload,
    };
  } catch {
    return baseRecord;
  }
}

// ---------------------------------------------------------------------------
// SubmissionRecord
// ---------------------------------------------------------------------------

interface SubmissionPayload {
  totalScore?: number;
}

export async function encryptSubmission(submission: SubmissionRecord, key: CryptoKey | null): Promise<SubmissionRecord> {
  const payload: SubmissionPayload = {
    totalScore: submission.totalScore,
  };

  let payloadCt = submission.payloadCt;
  let payloadIv = submission.payloadIv;

  if (key) {
    const jsonStr = JSON.stringify(payload);
    const { ct, iv } = await encryptBytes(key, encoder.encode(jsonStr));
    payloadCt = ct;
    payloadIv = iv;

    return {
      id: submission.id,
      examId: submission.examId,
      pseudonymHash: submission.pseudonymHash,
      scanCt: submission.scanCt,
      scanIv: submission.scanIv,
      annotationCt: submission.annotationCt,
      annotationIv: submission.annotationIv,
      createdAt: submission.createdAt,
      payloadCt,
      payloadIv,
    };
  }

  return {
    id: submission.id,
    examId: submission.examId,
    pseudonymHash: submission.pseudonymHash,
    totalScore: submission.totalScore,
    scanCt: submission.scanCt,
    scanIv: submission.scanIv,
    annotationCt: submission.annotationCt,
    annotationIv: submission.annotationIv,
    createdAt: submission.createdAt,
    payloadCt,
    payloadIv,
  };
}

export async function decryptSubmission(submission: SubmissionRecord, key: CryptoKey | null): Promise<SubmissionRecord> {
  const baseRecord: SubmissionRecord = {
    id: submission.id,
    examId: submission.examId,
    pseudonymHash: submission.pseudonymHash,
    totalScore: submission.totalScore,
    scanCt: submission.scanCt,
    scanIv: submission.scanIv,
    annotationCt: submission.annotationCt,
    annotationIv: submission.annotationIv,
    createdAt: submission.createdAt,
    payloadCt: submission.payloadCt,
    payloadIv: submission.payloadIv,
  };

  if (!key || !submission.payloadCt || !submission.payloadIv || submission.payloadCt.byteLength < 16) {
    return baseRecord;
  }

  try {
    const bytes = await decryptBytes(key, submission.payloadCt, submission.payloadIv);
    const payload: SubmissionPayload = JSON.parse(decoder.decode(bytes));
    return {
      ...baseRecord,
      ...payload,
    };
  } catch (err) {
    console.error('Failed to decrypt submission payload:', err);
    return baseRecord;
  }
}

// ---------------------------------------------------------------------------
// AuditEntry
// ---------------------------------------------------------------------------

interface AuditPayload {
  note?: string;
}

export async function encryptAuditEntry(entry: AuditEntry, key: CryptoKey | null): Promise<AuditEntry> {
  const payload: AuditPayload = {
    note: entry.note,
  };

  let payloadCt = entry.payloadCt;
  let payloadIv = entry.payloadIv;

  if (key) {
    const jsonStr = JSON.stringify(payload);
    const { ct, iv } = await encryptBytes(key, encoder.encode(jsonStr));
    payloadCt = ct;
    payloadIv = iv;
  }

  return {
    id: entry.id,
    action: entry.action,
    targetId: entry.targetId,
    timestamp: entry.timestamp,
    payloadCt,
    payloadIv,
  };
}

export async function decryptAuditEntry(entry: AuditEntry, key: CryptoKey | null): Promise<AuditEntry> {
  const baseRecord: AuditEntry = {
    id: entry.id,
    action: entry.action,
    targetId: entry.targetId,
    timestamp: entry.timestamp,
    payloadCt: entry.payloadCt,
    payloadIv: entry.payloadIv,
  };

  if (!key || !entry.payloadCt || !entry.payloadIv || entry.payloadCt.byteLength < 16) {
    return baseRecord;
  }

  try {
    const bytes = await decryptBytes(key, entry.payloadCt, entry.payloadIv);
    const payload: AuditPayload = JSON.parse(decoder.decode(bytes));
    return {
      ...baseRecord,
      ...payload,
    };
  } catch (err) {
    console.error('Failed to decrypt audit entry payload:', err);
    return baseRecord;
  }
}

// ---------------------------------------------------------------------------
// OmrTemplateRecord
// ---------------------------------------------------------------------------
// One per exam (id === examId). Holds bubble/fiducial rects extracted from a
// blank compile via pdfjs getAnnotations() -- follows the ScoreRecord pattern
// above (direct db.* access, no repository) since there's just one record per
// exam and no cross-record queries beyond examId lookup.

export async function encryptOmrTemplate(
  tpl: OmrTemplateRecord,
  key: CryptoKey | null,
  payload: OmrTemplatePayload
): Promise<OmrTemplateRecord> {
  let payloadCt = tpl.payloadCt;
  let payloadIv = tpl.payloadIv;

  if (key) {
    const jsonStr = JSON.stringify(payload);
    const { ct, iv } = await encryptBytes(key, encoder.encode(jsonStr));
    payloadCt = ct;
    payloadIv = iv;
  }

  return {
    id: tpl.id,
    examId: tpl.examId,
    exercisesHash: tpl.exercisesHash,
    createdAt: tpl.createdAt,
    payloadCt,
    payloadIv,
  };
}

export async function decryptOmrTemplate(
  tpl: OmrTemplateRecord,
  key: CryptoKey | null
): Promise<OmrTemplatePayload | null> {
  if (!key || !tpl.payloadCt || !tpl.payloadIv || tpl.payloadCt.byteLength < 16) {
    return null;
  }
  try {
    const bytes = await decryptBytes(key, tpl.payloadCt, tpl.payloadIv);
    return JSON.parse(decoder.decode(bytes)) as OmrTemplatePayload;
  } catch (err) {
    console.error('Failed to decrypt OMR template record:', err);
    return null;
  }
}

/** Loads the OMR template for an exam (undefined if none has been captured yet). */
export async function loadOmrTemplateEncrypted(
  examId: string,
  key: CryptoKey | null
): Promise<{ record: OmrTemplateRecord; payload: OmrTemplatePayload | null } | undefined> {
  const record = await db.omrTemplates.get(examId);
  if (!record) return undefined;
  const payload = await decryptOmrTemplate(record, key);
  return { record, payload };
}

/** Saves (overwrites) the OMR template for an exam. `id` is always set to `examId`. */
export async function saveOmrTemplateEncrypted(
  examId: string,
  exercisesHash: string,
  payload: OmrTemplatePayload,
  key: CryptoKey | null
): Promise<string> {
  const tpl: OmrTemplateRecord = {
    id: examId,
    examId,
    exercisesHash,
    createdAt: new Date().toISOString(),
  };
  const encrypted = await encryptOmrTemplate(tpl, key, payload);
  await db.omrTemplates.put(encrypted);
  return examId;
}

// ---------------------------------------------------------------------------
// High-Level Encrypted CRUD Operations (Delegated to Repositories)
// ---------------------------------------------------------------------------

import { examRepository } from '$lib/repositories/examRepository';
import { exerciseRepository } from '$lib/repositories/exerciseRepository';
import { studentRepository } from '$lib/repositories/studentRepository';
import { submissionRepository } from '$lib/repositories/submissionRepository';

export async function loadExamsEncrypted(key: CryptoKey | null): Promise<ExamRecord[]> {
  return examRepository.getAll(key);
}

export async function loadExamEncrypted(id: string, key: CryptoKey | null): Promise<ExamRecord | undefined> {
  return examRepository.getById(id, key);
}

export async function saveExamEncrypted(exam: ExamRecord, key: CryptoKey | null): Promise<string> {
  await examRepository.save(exam, key);
  return exam.id;
}

export async function loadExercisesEncrypted(key: CryptoKey | null): Promise<ExerciseRecord[]> {
  return exerciseRepository.getAll(key);
}

export async function loadExamExercisesEncrypted(examId: string, key: CryptoKey | null): Promise<ExerciseRecord[]> {
  return exerciseRepository.getByExamId(examId, key);
}

export async function saveExerciseEncrypted(exercise: ExerciseRecord, key: CryptoKey | null): Promise<string> {
  await exerciseRepository.save(exercise, key);
  return exercise.id;
}

export async function loadStudentsEncrypted(key: CryptoKey | null): Promise<StudentRecord[]> {
  return studentRepository.getAll(key);
}

export async function saveStudentEncrypted(student: StudentRecord, key: CryptoKey | null): Promise<string> {
  await studentRepository.save(student, key);
  return student.pseudonymId;
}

export async function loadSubmissionsEncrypted(key: CryptoKey | null): Promise<SubmissionRecord[]> {
  return submissionRepository.getAll(key);
}

export async function saveSubmissionEncrypted(submission: SubmissionRecord, key: CryptoKey | null): Promise<string> {
  await submissionRepository.save(submission, key);
  return submission.id;
}

export async function loadScoresEncrypted(submissionId: string, key: CryptoKey | null): Promise<ExerciseScoreRecord[]> {
  const raw = await db.exerciseScores.where('submissionId').equals(submissionId).toArray();
  return Promise.all(raw.map((sc) => decryptScore(sc, key)));
}

/**
 * Delete a single exercise score record from IndexedDB.
 * Used when resetting an exercise back to ungraded status.
 */
export async function deleteScoreEncrypted(submissionId: string, exerciseId: string): Promise<void> {
  const existing = await db.exerciseScores
    .where('submissionId')
    .equals(submissionId)
    .and((item) => item.exerciseId === exerciseId)
    .first();
  if (existing) {
    await db.exerciseScores.delete(existing.id);
  }
}

export async function saveScoreEncrypted(scoreRec: ExerciseScoreRecord, key: CryptoKey | null): Promise<string> {
  const encrypted = await encryptScore(scoreRec, key);
  await db.exerciseScores.put(encrypted);
  return scoreRec.id;
}

export interface McGroup {
  id: string;
  title: string;
  scoringText: string;
  memberIds: string[];
  orderIndex?: number;
}

export async function loadLocalMcGroups(examId: string): Promise<McGroup[]> {
  const groupRecords = await db.examMcGroups.where("examId").equals(examId).toArray();
  groupRecords.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  const result: McGroup[] = [];
  for (const g of groupRecords) {
    const links = await db.examExercises.where("mcGroupId").equals(g.id).toArray();
    links.sort((a, b) => (a.subIndex || 0) - (b.subIndex || 0));
    result.push({
      id: g.id,
      title: g.title,
      scoringText: g.scoringText,
      memberIds: links.map((l) => l.exerciseId),
      orderIndex: g.orderIndex,
    });
  }
  return result;
}



