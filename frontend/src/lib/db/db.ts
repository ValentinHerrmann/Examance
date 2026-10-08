/**
 * Dexie IndexedDB instance, all BlindGrade local stores: exams, exercises, examExercises, students, submissions, auditLog
 * (merged into .bgproj on export), exerciseResources. Only exam metadata and the exercise library are plaintext;
 * student PII, scans, annotations and resources are ciphertext.
 */

import { browser } from '$app/env';
import Dexie, { type Table } from 'dexie';
import type {
  AuditEntry,
  ExamExerciseRecord,
  ExamMcGroupRecord,
  ExamRecord,
  ExerciseRecord,
  ExerciseResourceRecord,
  ExerciseScoreRecord,
  OmrTemplateRecord,
  StudentRecord,
  SubmissionRecord,
  WorkspaceManifestRecord,
} from './schema';

export class BlindGradeDB extends Dexie {
  exams!: Table<ExamRecord>;
  exercises!: Table<ExerciseRecord>;
  examExercises!: Table<ExamExerciseRecord>;
  examMcGroups!: Table<ExamMcGroupRecord>;
  students!: Table<StudentRecord>;
  submissions!: Table<SubmissionRecord>;
  exerciseScores!: Table<ExerciseScoreRecord>;
  exerciseResources!: Table<ExerciseResourceRecord>;
  auditLog!: Table<AuditEntry>;
  omrTemplates!: Table<OmrTemplateRecord>;
  workspace!: Table<WorkspaceManifestRecord>;

  constructor() {
    super('BlindGrade');

    this.version(1).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      auditLog: 'id, action, timestamp',
    });

    this.version(2).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
    });

    this.version(3).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, topicTag, name',
      examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
    });

    this.version(4).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, topicTag, name, exerciseGroupId, variantKey, isCurrent',
      examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
    });

    this.version(5).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, topicTag, grade, subject, name, exerciseGroupId, variantKey, isCurrent',
      examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
    });

    this.version(6).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, topicTag, grade, subject, name, exerciseGroupId, variantKey, isCurrent',
      examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex, mcGroupId',
      examMcGroups: 'id, examId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
    });

    // v7: adds omrTemplates (one per exam, keyed by examId) for MC auto-grading —
    // captures bubble/fiducial rects extracted from a blank compile via pdfjs
    // getAnnotations(). See docs/data_flow_and_security.md and the OMR plan.
    this.version(7).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, topicTag, grade, subject, name, exerciseGroupId, variantKey, isCurrent',
      examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex, mcGroupId',
      examMcGroups: 'id, examId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
      omrTemplates: 'id, examId',
    });

    // v8: adds exerciseResources — teacher-uploaded files (images, PDFs, data
    // files) that an exercise's LaTeX references by flat filename. Bytes are
    // encrypted; filename/mimeType/byteSize are plaintext index fields.
    this.version(8).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, topicTag, grade, subject, name, exerciseGroupId, variantKey, isCurrent',
      examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex, mcGroupId',
      examMcGroups: 'id, examId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
      omrTemplates: 'id, examId',
      exerciseResources: 'id, exerciseId, [exerciseId+filename]',
    });

        // v9: drops the plaintext `fallbackCode` index from `students` and strips plaintext identity columns from every row
        // (L17, docs/legal_audit_dsgvo.md: names sat unencrypted in IndexedDB). The strip never re-encrypts (`payloadCt`
        // already holds the fields), so it needs no key and works while locked.
    this.version(9)
      .stores({
        exams: 'id, teacherId, retentionUntil',
        exercises: 'id, examId, topicTag, grade, subject, name, exerciseGroupId, variantKey, isCurrent',
        examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex, mcGroupId',
        examMcGroups: 'id, examId, orderIndex',
        students: 'pseudonymId, examId',
        submissions: 'id, examId, pseudonymHash',
        exerciseScores: 'id, submissionId, exerciseId',
        auditLog: 'id, action, timestamp',
        omrTemplates: 'id, examId',
        exerciseResources: 'id, exerciseId, [exerciseId+filename]',
      })
      .upgrade((tx) =>
        tx
          .table('students')
          .toCollection()
          .modify((student: Record<string, unknown>) => {
            delete student.fallbackCode;
            delete student.studentName;
            delete student.studentNumber;
          }),
      );

    // v10: adds `workspace`, a single-row manifest stamping the storage mode and owner of everything
    // else in this database (docs/dev/storage_modes.md). Not one of `vaultTables()`: wiping the data
    // keeps the manifest, replacing the workspace rewrites it in the same transaction.
    this.version(10).stores({
      workspace: 'id',
    });
  }
}

/** Singleton DB instance — import this everywhere. */
export const db = (browser || typeof indexedDB !== 'undefined') ? new BlindGradeDB() : ({} as BlindGradeDB);

/**
 * Checks for and migrates legacy 'Blindgrade' IndexedDB records if present.
 */
export async function migrateLegacyDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const exists = await Dexie.exists('Blindgrade');
    if (!exists) return;
    const oldDb = new Dexie('Blindgrade');
    oldDb.version(5).stores({
      exams: 'id, teacherId, retentionUntil',
      exercises: 'id, examId, topicTag, grade, subject, name, exerciseGroupId, variantKey, isCurrent',
      examExercises: '[examId+exerciseId], examId, exerciseId, orderIndex',
      students: 'pseudonymId, examId, fallbackCode',
      submissions: 'id, examId, pseudonymHash',
      exerciseScores: 'id, submissionId, exerciseId',
      auditLog: 'id, action, timestamp',
    });
    await oldDb.open();
    for (const table of oldDb.tables) {
      const records = await table.toArray();
      if (records.length > 0 && db.table(table.name)) {
        await db.table(table.name).bulkPut(records);
      }
    }
    await oldDb.delete();
  } catch {
    // Ignore migration failures if legacy DB is unavailable or inaccessible
  }
}

/** Every table that holds workspace data (everything but the `workspace` manifest). */
export function vaultTables(): Table[] {
  return [
    db.exams,
    db.exercises,
    db.examExercises,
    db.examMcGroups,
    db.students,
    db.submissions,
    db.exerciseScores,
    db.auditLog,
    db.omrTemplates,
    db.exerciseResources,
  ];
}

/**
 * Clears every workspace data table in one transaction; the manifest is kept.
 * @throws when IndexedDB refuses: a silently half-cleared database is how server rows used to leak into
 * an all-local workspace, so callers must see the failure.
 */
export async function clearAllTables(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  if (!db.isOpen()) {
    await db.open();
  }
  const tables = vaultTables();
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}
