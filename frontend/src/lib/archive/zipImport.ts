/** Reads an exam or exercise-library ZIP export (`export/zipManifest.ts`) back into an archive payload, which then runs through the normal import (conflicts, server creation, report). Only settings and exercises travel this way. */
import { strFromU8, unzipSync } from 'fflate';
import type { ExerciseRecord } from '#lib/db/schema';
import { uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import { translate } from '#lib/i18n';
import { guessMimeType } from '#lib/latex/resources';
import {
  ZIP_FORMAT_VERSION,
  ZIP_MANIFEST,
  type ExamZipManifest,
  type ExerciseZipManifest,
  type ZipExerciseEntry,
} from '#lib/export/zipManifest';

type Row = Record<string, any>;
type Files = Record<string, Uint8Array>;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function exercise(entry: ZipExerciseEntry, files: Files, groupId: string, variantKey: string | null | undefined): ExerciseRecord {
  const tex = files[entry.texFile];
  if (!tex) throw new Error(translate('workspace.zipImport.missingFile', { file: entry.texFile }));
  const key = entry.variantKey ?? variantKey;
  return {
    id: entry.id ?? crypto.randomUUID(),
    // Same shape as `mapApiToExerciseRecord`, so re-importing an unchanged ZIP compares as identical.
    title: entry.name,
    name: entry.name,
    version: entry.version ?? 1,
    latexBody: strFromU8(tex),
    maxPoints: entry.maxPoints ?? 0,
    topicTag: entry.topic ?? undefined,
    grade: entry.grade ?? undefined,
    subject: entry.subject ?? undefined,
    questionType: entry.questionType ?? 'free_text',
    options: entry.options ?? [],
    correctAnswers: entry.correctAnswers ?? [],
    penalty: entry.penalty ?? 0,
    exerciseGroupId: entry.exerciseGroupId ?? groupId,
    variantKey: key && key !== '_General' ? key : undefined,
  };
}

/** The exercise's files as archive resource rows; a file missing from the ZIP is skipped (the report lists it). */
function resources(entry: ZipExerciseEntry, exerciseId: string, files: Files): Row[] {
  return (entry.resources ?? []).map((filename) => {
    const bytes = files[`${entry.path}/${filename}`];
    return {
      id: crypto.randomUUID(),
      exerciseId,
      filename,
      mimeType: guessMimeType(filename),
      byteSize: bytes?.length ?? 0,
      createdAt: new Date().toISOString(),
      dataB64: bytes ? uint8ArrayToBase64(bytes) : '',
    };
  });
}

function emptyPayload(): Row {
  return {
    codeWithheld: false,
    exams: [],
    exercises: [],
    exerciseExams: [],
    examMcGroups: [],
    exerciseResources: [],
    students: [],
    submissions: [],
    exerciseScores: [],
    examLogos: [],
    auditLogs: [],
  };
}

function libraryPayload(manifest: ExerciseZipManifest, files: Files): Row {
  const payload = emptyPayload();
  for (const group of manifest.groups ?? []) {
    // Library ZIPs from before ids were written: one fresh group per folder keeps the variants together.
    const groupId = crypto.randomUUID();
    for (const variant of group.variants ?? []) {
      for (const entry of variant.exercises ?? []) {
        const ex = exercise(entry, files, groupId, variant.key);
        payload.exercises.push(ex);
        payload.exerciseResources.push(...resources(entry, ex.id, files));
      }
    }
  }
  return payload;
}

function examPayload(manifest: ExamZipManifest, files: Files): Row {
  const payload = emptyPayload();
  const examId = manifest.exam.id;
  // No retention date: the importer's default applies (`serverImport.ts`), and a re-import stays "identical".
  payload.exams.push({
    ...manifest.exam,
    teacherId: '',
    compilationStatus: 'pending',
    createdAt: new Date().toISOString(),
  });
  for (const entry of manifest.exercises ?? []) {
    // An exam's exercises without a group each get their own, like a newly created exercise.
    const ex = exercise(entry, files, crypto.randomUUID(), entry.variantKey);
    payload.exercises.push(ex);
    payload.exerciseResources.push(...resources(entry, ex.id, files));
  }
  payload.exerciseExams = (manifest.links ?? []).map((l) => ({ ...l, examId }));
  payload.examMcGroups = (manifest.mcGroups ?? []).map((g) => ({ ...g, examId, orderIndex: g.orderIndex ?? 1 }));
  return payload;
}

// A ZIP bomb must fail before it is inflated in memory (S13); real exports stay far below both.
const MAX_ZIP_ENTRIES = 20_000;
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;

/** @throws a translated error when the file is no Examance ZIP export, or one without the re-import data. */
export function readZipExport(bytes: Uint8Array): Row {
  let files: Files;
  let entries = 0;
  let total = 0;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        total += file.originalSize;
        if (entries > MAX_ZIP_ENTRIES || total > MAX_ZIP_BYTES) throw new Error('ZIP too large');
        return true;
      },
    });
  } catch {
    throw new Error(translate('workspace.zipImport.unreadable'));
  }
  const raw = files[ZIP_MANIFEST];
  if (!raw) throw new Error(translate('workspace.zipImport.noManifest'));
  let manifest: any;
  try {
    manifest = JSON.parse(strFromU8(raw));
  } catch {
    throw new Error(translate('workspace.zipImport.unreadable'));
  }
  if ((manifest.formatVersion ?? 0) > ZIP_FORMAT_VERSION) throw new Error(translate('workspace.zipImport.newer'));
  if (manifest.kind === 'exam') return examPayload(manifest, files);
  if (Array.isArray(manifest.groups)) return libraryPayload(manifest, files);
  throw new Error(translate('workspace.zipImport.noManifest'));
}
