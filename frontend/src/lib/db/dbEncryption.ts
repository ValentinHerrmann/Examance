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
import {
  assertEncryptable,
  markDecryptFailed,
  MissingSessionKeyError,
  type MaybeUndecryptable,
} from './decryptGuard';
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
    // Never fall back to raw bytes in `data`: that is plaintext at rest.
    throw new MissingSessionKeyError('exerciseResource');
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
// Record codecs
//
// Every record type is split the same way: plain index/link columns stay
// readable (Dexie queries them), everything in `sealed` goes into one
// AES-256-GCM `payloadCt`. Both lists are explicit whitelists — a field that is
// in neither is dropped on write, so a caller spreading extra data onto a
// record can never leak it into IndexedDB in plaintext.
// ---------------------------------------------------------------------------

interface RecordCodec<T> {
  kind: string;
  plain: readonly (keyof T)[];
  sealed: readonly (keyof T)[];
}

function pick<T>(record: T, fields: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const f of fields) out[f] = record[f];
  return out;
}

async function sealRecord<T extends MaybeUndecryptable & SealedPayload>(
  record: T,
  key: CryptoKey | null,
  codec: RecordCodec<T>
): Promise<T> {
  assertEncryptable(record, key, codec.kind);
  const payload = JSON.stringify(pick(record, codec.sealed));
  const { ct, iv } = await encryptBytes(key, encoder.encode(payload));
  // The whitelist drops every sealed field, which the record types mark
  // optional — so the partial is a complete record for everything required.
  return { ...pick(record, codec.plain), payloadCt: ct, payloadIv: iv } as unknown as T;
}

async function openRecord<T extends MaybeUndecryptable & SealedPayload>(
  record: T,
  key: CryptoKey | null,
  codec: RecordCodec<T>
): Promise<T> {
  const base = {
    ...pick(record, codec.plain),
    ...pick(record, codec.sealed),
    payloadCt: record.payloadCt,
    payloadIv: record.payloadIv,
  } as T;

  const { payloadCt, payloadIv } = record;
  // Nothing sealed (legacy plaintext row): safe to return and to write back.
  if (!payloadCt || !payloadIv || payloadCt.byteLength < 16) return base;
  // Sealed but no key: fine to render, never to write back.
  if (!key) return markDecryptFailed(base, codec.kind, 'locked');

  try {
    const bytes = await decryptBytes(key, payloadCt, payloadIv);
    return { ...base, ...JSON.parse(decoder.decode(bytes)) };
  } catch (err) {
    console.error(`Failed to decrypt ${codec.kind} record:`, err);
    return markDecryptFailed(base, codec.kind);
  }
}

interface SealedPayload {
  payloadCt?: Uint8Array;
  payloadIv?: Uint8Array;
}

const EXAM: RecordCodec<ExamRecord> = {
  kind: 'exam',
  plain: ['id', 'teacherId', 'retentionUntil', 'compilationStatus', 'createdAt', 'isDirty'],
  sealed: [
    'title', 'testart', 'grade', 'klasse', 'datum', 'nr', 'fach', 'lehrernachname',
    'infoText', 'latexPreamble', 'latexTemplate', 'numVersions', 'gradingKey',
  ],
};

const EXERCISE: RecordCodec<ExerciseRecord> = {
  kind: 'exercise',
  plain: [
    'id', 'teacherId', 'examId', 'orderIndex', 'maxPoints', 'topicTag', 'grade', 'subject',
    'version', 'exerciseGroupId', 'variantKey', 'isCurrent', 'createdAt', 'updatedAt',
    'questionType', 'penalty',
  ],
  sealed: ['title', 'name', 'latexBody', 'options', 'correctAnswers'],
};

const SCORE: RecordCodec<ExerciseScoreRecord> = {
  kind: 'score',
  plain: ['id', 'submissionId', 'exerciseId'],
  sealed: ['score', 'selectedOptions', 'omrMeta'],
};

// Identity fields live only inside the payload — re-emitting them as plain
// columns was the L17 leak (docs/legal_audit_dsgvo.md).
const STUDENT: RecordCodec<StudentRecord> = {
  kind: 'student',
  plain: ['pseudonymId', 'examId', 'piiCt', 'piiIv'],
  sealed: ['fallbackCode', 'studentName', 'studentNumber'],
};

const SUBMISSION: RecordCodec<SubmissionRecord> = {
  kind: 'submission',
  plain: [
    'id', 'examId', 'pseudonymHash', 'scanCt', 'scanIv', 'annotationCt', 'annotationIv',
    'createdAt',
  ],
  sealed: ['totalScore'],
};

const AUDIT: RecordCodec<AuditEntry> = {
  kind: 'auditEntry',
  plain: ['id', 'action', 'targetId', 'timestamp'],
  sealed: ['note'],
};

type Key = CryptoKey | null;
export const encryptExam = (r: ExamRecord, k: Key) => sealRecord(r, k, EXAM);
export const decryptExam = (r: ExamRecord, k: Key) => openRecord(r, k, EXAM);
export const encryptExercise = (r: ExerciseRecord, k: Key) => sealRecord(r, k, EXERCISE);
export const decryptExercise = (r: ExerciseRecord, k: Key) => openRecord(r, k, EXERCISE);
export const encryptScore = (r: ExerciseScoreRecord, k: Key) => sealRecord(r, k, SCORE);
export const decryptScore = (r: ExerciseScoreRecord, k: Key) => openRecord(r, k, SCORE);
export const encryptStudent = (r: StudentRecord, k: Key) => sealRecord(r, k, STUDENT);
export const decryptStudent = (r: StudentRecord, k: Key) => openRecord(r, k, STUDENT);
export const encryptSubmission = (r: SubmissionRecord, k: Key) => sealRecord(r, k, SUBMISSION);
export const decryptSubmission = (r: SubmissionRecord, k: Key) => openRecord(r, k, SUBMISSION);
export const encryptAuditEntry = (r: AuditEntry, k: Key) => sealRecord(r, k, AUDIT);
export const decryptAuditEntry = (r: AuditEntry, k: Key) => openRecord(r, k, AUDIT);

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
  if (!key) {
    throw new MissingSessionKeyError('omrTemplate');
  }
  const { ct, iv } = await encryptBytes(key, encoder.encode(JSON.stringify(payload)));

  return {
    id: tpl.id,
    examId: tpl.examId,
    exercisesHash: tpl.exercisesHash,
    createdAt: tpl.createdAt,
    payloadCt: ct,
    payloadIv: iv,
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

export async function loadSubmissionsEncrypted(
  key: CryptoKey | null,
  opts: { includeScans?: boolean } = {}
): Promise<SubmissionRecord[]> {
  return submissionRepository.getAll(key, undefined, opts);
}

export async function saveSubmissionEncrypted(submission: SubmissionRecord, key: CryptoKey | null): Promise<string> {
  await submissionRepository.save(submission, key);
  return submission.id;
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



