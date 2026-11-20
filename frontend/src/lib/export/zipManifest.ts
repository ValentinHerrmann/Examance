/** `manifest.json` of the plaintext ZIP exports, read back by `archive/zipImport.ts` (issue #145). Version 1 added ids, group ids and variant keys; older library ZIPs (no `kind`) still import. */
import type { ExamRecord, ExerciseRecord, GradingKeyConfig } from '#lib/db/schema';
import { parseExerciseScore } from '#lib/latex/scoreParser';

export const ZIP_MANIFEST = 'manifest.json';
export const ZIP_FORMAT_VERSION = 1;

export interface ZipExerciseEntry {
  id?: string;
  exerciseGroupId?: string | null;
  variantKey?: string | null;
  name: string;
  topic: string | null;
  grade: string | null;
  subject: string | null;
  questionType: ExerciseRecord['questionType'];
  options: string[];
  correctAnswers: number[];
  penalty: number;
  maxPoints: number;
  version?: number;
  path: string;
  texFile: string;
  /** File names inside `path`. */
  resources: string[];
  pdfs: string[];
}

export interface ExerciseZipManifest {
  generator: string;
  kind?: 'exercises';
  formatVersion?: number;
  exportedAt: string;
  groups: {
    name: string;
    path: string;
    texFile: string;
    variants: { key: string; exercises: ZipExerciseEntry[] }[];
  }[];
}

/** The exam's own settings; retention, owner and compile state are the importer's. */
/** The exam's layout fields travel exactly as stored (`ExamRecord`); absent ones read as their defaults in older ZIPs. */
type ZipExamLayout = Pick<ExamRecord, 'pageBreaks' | 'nameLine' | 'mcCorrectionHint' | 'pageCodes' | 'printLayout' | 'stickerSpots' | 'printMode' | 'paperStyle' | 'extraPages' | 'bookletOffsetMm' | 'digitalGrading' | 'resultsQrBox' | 'cutCorner' | 'foldStrip' | 'dottedFields' | 'extraNotes'>;

export interface ZipExamSettings extends ZipExamLayout {
  id: string;
  title?: string;
  testart?: string;
  grade?: string;
  klasse?: string;
  course?: string;
  datum?: string;
  /** Working time in whole minutes; older exports carry it in the bracket of `datum`. */
  durationMinutes?: number;
  /** Reading time in whole minutes. */
  readingMinutes?: number;
  nr?: string;
  fach?: string;
  topic?: string;
  lehrernachname?: string;
  infoText?: string;
  latexPreamble?: string;
  latexTemplate?: string;
  numVersions?: number;
  gradingKey?: GradingKeyConfig;
}

export interface ExamZipManifest {
  generator: string;
  kind: 'exam';
  formatVersion: number;
  exportedAt: string;
  exam: ZipExamSettings;
  exercises: ZipExerciseEntry[];
  links: { exerciseId: string; orderIndex: number; mcGroupId?: string | null; subIndex?: number | null }[];
  mcGroups: { id: string; title: string; scoringText: string; orderIndex?: number }[];
}

export function manifestHeader() {
  return { generator: 'Examance', formatVersion: ZIP_FORMAT_VERSION, exportedAt: new Date().toISOString() };
}

export function exerciseEntry(ex: ExerciseRecord, name: string, dir: string, resources: string[], pdfs: string[]): ZipExerciseEntry {
  const body = ex.latexBody ?? '';
  return {
    id: ex.id,
    exerciseGroupId: ex.exerciseGroupId ?? null,
    variantKey: ex.variantKey ?? null,
    name,
    topic: ex.topicTag ?? null,
    grade: ex.grade ?? null,
    subject: ex.subject ?? null,
    questionType: ex.questionType,
    options: ex.options ?? [],
    correctAnswers: ex.correctAnswers ?? [],
    penalty: ex.penalty,
    maxPoints: parseExerciseScore(body) || ex.maxPoints || 0,
    version: ex.version,
    path: dir,
    texFile: `${dir}/exercise.tex`,
    resources,
    pdfs,
  };
}
