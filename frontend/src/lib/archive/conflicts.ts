/**
 * Import conflict detection and resolution before anything is written: keep existing, import as a copy, or (results only)
 * take the archive's. No copies for students/submissions (duplicate pseudonym = data-protection problem); no "take" for
 * exams, exercises and MC groups, whose create-only POST turned it into a hidden duplicate (issue #145).
 */

import { db } from '#lib/db/db';
import { examRepository } from '#lib/repositories/examRepository';
import { exerciseRepository } from '#lib/repositories/exerciseRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { storedEntries } from '#lib/latex/packages';
import { remapPageBreaks } from '#lib/exam/pageBreaks';

export type ConflictKind = 'exam' | 'exercise' | 'mcGroup' | 'student' | 'submission';
export type ConflictChoice = 'keep-existing' | 'take-imported' | 'import-as-copy';

export interface ConflictField {
  /** Suffix under `storagePolicy.conflict.field.*`. */
  key: string;
  existing: string | null;
  imported: string | null;
  differs: boolean;
}

export interface ArchiveConflict {
  kind: ConflictKind;
  id: string;
  title: string;
  fields: ConflictField[];
  /** A long text worth showing in full (LaTeX body, preamble). */
  textDiff?: { existing: string; imported: string };
  allowCopy: boolean;
  /** Whether the archive's version can overwrite in place (results upsert by id; exams and exercises cannot). */
  allowTake: boolean;
}

export interface ConflictDecision {
  id: string;
  kind: ConflictKind;
  choice: ConflictChoice;
}

export type DecisionMap = Map<string, ConflictDecision>;

type Row = Record<string, any>;
type Accessors = Record<string, (row: Row) => unknown>;

/** Accessors that read a field of the same name. */
const props = (...keys: string[]): Accessors =>
  Object.fromEntries(keys.map((k) => [k, (row: Row) => row[k]]));

interface KindSpec {
  kind: ConflictKind;
  payloadKey: string;
  id: (row: Row) => string;
  title: (row: Row) => string;
  fields: Accessors;
  text?: (row: Row) => string;
  /** Fields an import file may leave out (ZIP exports carry no retention date); absent there is no difference. */
  optional?: string[];
  allowCopy: boolean;
  allowTake: boolean;
  /** What the target store already holds, for the rows the archive brings. */
  existing: (rows: Row[], key: CryptoKey | null, ownExamIds: Set<string>) => Promise<Row[]>;
}

/**
 * Students and submissions are scoped per exam, so they are loaded per exam, and only for exams
 * this account owns: another account's exam cannot hold this account's results, and asking the
 * server about it answers 401 (which used to raise an error pop-up and a token refresh per exam).
 */
async function perExam(
  rows: Row[],
  ownExamIds: Set<string>,
  load: (examId: string) => Promise<Row[]>
): Promise<Row[]> {
  const examIds = [...new Set(rows.map((r) => r.examId as string))].filter((id) => ownExamIds.has(id));
  return (await Promise.all(examIds.map(load))).flat();
}

/** An exam's package additions as one comparable line (issue #108). */
const packageSummary = (entries: unknown) =>
  storedEntries(entries)
    .map((e) => (e.disabled ? '-' : '') + e.name + (e.options ? `[${e.options}]` : ''))
    .join(', ');

/** The extra-notes block (issue #156) as one comparable line; null when off. */
const extraNotesSummary = (notes: Row | null | undefined) =>
  notes
    ? `${notes.title} · ${notes.minHeightCm}–${notes.maxHeightCm} cm` + (notes.description ? ` · ${notes.description}` : '')
    : null;

/** Page breaks compared as a set of ids, shown as their count; null when there are none. */
const pageBreaksSummary = (breaks: unknown): Keyed => {
  const ids = Array.isArray(breaks) ? [...breaks].map(String).sort() : [];
  return { shown: ids.length ? String(ids.length) : null, key: ids.join(',') };
};

const SPECS: KindSpec[] = [
  {
    kind: 'exam',
    payloadKey: 'exams',
    id: (r) => r.id,
    title: (r) => r.title || r.id,
    fields: {
      ...props('title', 'testart', 'fach', 'topic', 'grade', 'klasse', 'datum', 'nr', 'numVersions', 'retentionUntil'),
      gradingKey: (r) => r.gradingKey?.preset,
      latexPackages: (r) => packageSummary(r.latexPackages),
      // Layout switches travel with the exam; without them a layout-only change counted as "identical" and was dropped.
      nameLine: (r) => r.nameLine === true,
      extraNotes: (r) => extraNotesSummary(r.extraNotes),
      pageBreaks: (r) => pageBreaksSummary(r.pageBreaks),
    },
    text: (r) => r.latexPreamble ?? '',
    optional: ['retentionUntil'],
    allowCopy: true,
    allowTake: false,
    existing: (_rows, key) => examRepository.getAll(key),
  },
  {
    kind: 'exercise',
    payloadKey: 'exercises',
    id: (r) => r.id,
    title: (r) => r.name || r.title || r.id,
    fields: props(
      'name', 'title', 'version', 'variantKey', 'maxPoints', 'questionType', 'penalty',
      'options', 'correctAnswers'
    ),
    text: (r) => r.latexBody ?? '',
    allowCopy: true,
    allowTake: false,
    existing: (_rows, key) => exerciseRepository.getAll(key),
  },
  {
    kind: 'mcGroup',
    payloadKey: 'examMcGroups',
    id: (r) => r.id,
    title: (r) => r.title || r.id,
    fields: props('title', 'scoringText'),
    allowCopy: true,
    allowTake: false,
    existing: () => db.examMcGroups.toArray(),
  },
  {
    kind: 'student',
    payloadKey: 'students',
    id: (r) => r.pseudonymId,
    title: (r) => r.studentName || r.fallbackCode || r.pseudonymId,
    fields: props('studentName', 'studentNumber', 'fallbackCode'),
    allowCopy: false,
    allowTake: true,
    existing: (rows, key, own) => perExam(rows, own, (id) => studentRepository.getByExamId(id, key)),
  },
  {
    kind: 'submission',
    payloadKey: 'submissions',
    id: (r) => r.id,
    title: (r) => String(r.pseudonymHash ?? r.id).slice(0, 8),
    fields: {
      ...props('totalScore', 'createdAt'),
      // `scanCt`/`annotationCt` exist only on a full fetch; `hasScan`/`hasAnnotations` are the list
      // endpoint's cheap flags and stay accurate without the bytes (see submissionRepository `includeScans`).
      // Archived submissions carry the decrypted bytes (`scanBytes`/`annotationBytes`) instead.
      hasScan: (r) => Boolean(r.scanCt) || Boolean(r.scanBytes) || Boolean(r.hasScan),
      hasAnnotations: (r) => Boolean(r.annotationCt) || Boolean(r.annotationBytes) || Boolean(r.hasAnnotations),
    },
    allowCopy: false,
    allowTake: true,
    existing: (rows, key, own) => perExam(rows, own, (id) => submissionRepository.getByExamId(id, key)),
  },
];

/** A field shown one way but compared by `key`: page break ids mean nothing to a teacher, their count does. */
interface Keyed {
  shown: string | null;
  key: string;
}
const isKeyed = (v: unknown): v is Keyed => typeof v === 'object' && v !== null && 'key' in v && 'shown' in v;

function display(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  return String(value);
}

function compare(spec: KindSpec, current: Row, incoming: Row): ArchiveConflict | null {
  const fields = Object.entries(spec.fields).map(([key, read]) => {
    const [a, b] = [read(current), read(incoming)];
    const existing = isKeyed(a) ? a.shown : display(a);
    const imported = isKeyed(b) ? b.shown : display(b);
    const differs =
      isKeyed(a) && isKeyed(b) ? a.key !== b.key : existing !== imported && !(imported === null && spec.optional?.includes(key));
    return { key, existing, imported, differs };
  });
  const textDiff = spec.text && { existing: spec.text(current), imported: spec.text(incoming) };
  const identical =
    fields.every((f) => !f.differs) && (!textDiff || textDiff.existing === textDiff.imported);
  if (identical) return null;
  return {
    kind: spec.kind,
    id: spec.id(incoming),
    title: spec.title(incoming),
    fields,
    textDiff,
    allowCopy: spec.allowCopy,
    allowTake: spec.allowTake,
  };
}

export interface ConflictScan {
  conflicts: ArchiveConflict[];
  identicalCount: number;
  /** Records the target store already holds unchanged, per kind; the import skips them. */
  identical: { kind: ConflictKind; id: string }[];
  /** Exams this account owns (results of other exams cannot conflict). */
  ownExamIds: Set<string>;
}

/**
 * Compares an archive against what the target store holds (via the repositories, so it asks the
 * store the import writes to). Identical collisions are not returned as conflicts; they are listed
 * so the import skips them instead of writing a duplicate.
 */
export async function detectConflicts(payload: Row, key: CryptoKey | null): Promise<ConflictScan> {
  const conflicts: ArchiveConflict[] = [];
  const identical: { kind: ConflictKind; id: string }[] = [];
  const ownExamIds = new Set((await examRepository.getAll(key)).map((e) => e.id));

  for (const spec of SPECS) {
    const rows: Row[] = payload[spec.payloadKey] ?? [];
    if (rows.length === 0) continue;
    const existing = new Map((await spec.existing(rows, key, ownExamIds)).map((r) => [spec.id(r), r]));
    for (const incoming of rows) {
      const current = existing.get(spec.id(incoming));
      if (!current) continue;
      const conflict = compare(spec, current, incoming);
      if (conflict) conflicts.push(conflict);
      else identical.push({ kind: spec.kind, id: spec.id(incoming) });
    }
  }
  return { conflicts, identicalCount: identical.length, identical, ownExamIds };
}

/** Every conflict gets `choice`; a copy or take falls back to keep where that kind does not allow it. */
export function applyToAll(
  conflicts: ArchiveConflict[],
  choice: ConflictChoice,
  existing: DecisionMap = new Map()
): DecisionMap {
  const decisions = new Map(existing);
  for (const c of conflicts) {
    const allowed =
      choice === 'keep-existing' || (choice === 'import-as-copy' ? c.allowCopy : c.allowTake);
    const effective = allowed ? choice : 'keep-existing';
    decisions.set(c.id, { id: c.id, kind: c.kind, choice: effective });
  }
  return decisions;
}

/** Annotation strokes name their exercise; a copied exercise's strokes must follow its new id. */
function remapStrokeExercises(bytes: unknown, idMap: Map<string, string>): unknown {
  if (!(bytes instanceof Uint8Array) || idMap.size === 0) return bytes;
  try {
    const strokes = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(strokes)) return bytes;
    const next = strokes.map((st) => (st?.exerciseId && idMap.has(st.exerciseId) ? { ...st, exerciseId: idMap.get(st.exerciseId) } : st));
    return new TextEncoder().encode(JSON.stringify(next));
  } catch {
    return bytes; // Not stroke JSON: leave it exactly as archived.
  }
}

/**
 * Rewrites the payload per the decisions: kept records dropped, copies get one fresh id that every
 * reference follows. Loosely typed on purpose: the archive may carry unknown fields that must round-trip.
 */
export function applyResolutions(
  payload: Row,
  decisions: DecisionMap,
  identical: { id: string }[] = []
): { payload: Row; idMap: Map<string, string>; skipped: Set<string> } {
  const idMap = new Map<string, string>();
  // Identical records are already there: writing them again only produced 409s and duplicates.
  const skipped = new Set<string>(identical.map((r) => r.id));
  for (const d of decisions.values()) {
    if (d.choice === 'keep-existing') skipped.add(d.id);
    if (d.choice === 'import-as-copy') idMap.set(d.id, crypto.randomUUID());
  }

  const remap = (id: string | undefined) => (id && idMap.get(id)) || id;
  const rewrite = (key: string, idOf: (r: Row) => string, patch: (r: Row) => Row) =>
    ((payload[key] ?? []) as Row[]).filter((r) => !skipped.has(idOf(r))).map((r) => ({ ...r, ...patch(r) }));

  const next: Row = {
    ...payload,
    // Page breaks name exercises / MC groups, which a copy gives fresh ids.
    exams: rewrite('exams', (r) => r.id, (r) => ({ id: remap(r.id), pageBreaks: remapPageBreaks(r.pageBreaks, idMap) })),
    exercises: rewrite('exercises', (r) => r.id, (r) => ({ id: remap(r.id), examId: remap(r.examId) })),
    examMcGroups: rewrite('examMcGroups', (r) => r.id, (r) => ({ id: remap(r.id), examId: remap(r.examId) })),
    students: rewrite('students', (r) => r.pseudonymId, (r) => ({ examId: remap(r.examId) })),
    submissions: rewrite('submissions', (r) => r.id, (r) => ({
      examId: remap(r.examId),
      annotationBytes: remapStrokeExercises(r.annotationBytes, idMap),
    })),
    // Files follow their exercise: a kept or identical one keeps its own, a copy takes the archived ones.
    exerciseResources: rewrite('exerciseResources', (r) => r.exerciseId, (r) => ({ exerciseId: remap(r.exerciseId) })),
    // The logo is part of its exam: a kept exam keeps its own, a copy takes the archived one.
    examLogos: rewrite('examLogos', (r) => r.examId, (r) => ({ examId: remap(r.examId) })),
    // A kept exam keeps its own links. A kept exercise is still linked: the importer reuses the
    // existing exercise instead of dropping the link (`serverImport.ts`).
    exerciseExams: ((payload.exerciseExams ?? []) as Row[])
      .filter((j) => !skipped.has(j.examId))
      .map((j) => ({
        ...j,
        examId: remap(j.examId),
        exerciseId: remap(j.exerciseId),
        mcGroupId: remap(j.mcGroupId),
      })),
  };

  // Scores follow their submission: a kept submission keeps its own scores.
  const keptSubmissions = new Set((next.submissions as Row[]).map((s) => s.id));
  next.exerciseScores = ((payload.exerciseScores ?? []) as Row[])
    .filter((sc) => keptSubmissions.has(sc.submissionId))
    .map((sc) => ({ ...sc, exerciseId: remap(sc.exerciseId) }));

  return { payload: next, idMap, skipped };
}
