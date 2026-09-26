/**
 * Import conflict detection and resolution, before anything is written: keep
 * existing, take the archive's, or import as a copy under a new id. No copies
 * for students and submissions — a duplicate pseudonym is a data-protection problem.
 */

import { db } from '$lib/db/db';
import { examRepository } from '$lib/repositories/examRepository';
import { exerciseRepository } from '$lib/repositories/exerciseRepository';
import { studentRepository } from '$lib/repositories/studentRepository';
import { submissionRepository } from '$lib/repositories/submissionRepository';

export type ConflictKind = 'exam' | 'exercise' | 'mcGroup' | 'student' | 'submission' | 'resource';
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
  allowCopy: boolean;
  /** What the target store already holds, for the rows the archive brings. */
  existing: (rows: Row[], key: CryptoKey | null) => Promise<Row[]>;
}

/** Students and submissions are scoped per exam, so they are loaded per exam. */
async function perExam(rows: Row[], load: (examId: string) => Promise<Row[]>): Promise<Row[]> {
  const examIds = [...new Set(rows.map((r) => r.examId as string))];
  return (await Promise.all(examIds.map(load))).flat();
}

const SPECS: KindSpec[] = [
  {
    kind: 'exam',
    payloadKey: 'exams',
    id: (r) => r.id,
    title: (r) => r.title || r.id,
    fields: {
      ...props('title', 'testart', 'fach', 'grade', 'klasse', 'datum', 'nr', 'numVersions', 'retentionUntil'),
      gradingKey: (r) => r.gradingKey?.preset,
    },
    text: (r) => r.latexPreamble ?? '',
    allowCopy: true,
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
    existing: (_rows, key) => exerciseRepository.getAll(key),
  },
  {
    kind: 'mcGroup',
    payloadKey: 'examMcGroups',
    id: (r) => r.id,
    title: (r) => r.title || r.id,
    fields: props('title', 'scoringText'),
    allowCopy: true,
    existing: () => db.examMcGroups.toArray(),
  },
  {
    kind: 'student',
    payloadKey: 'students',
    id: (r) => r.pseudonymId,
    title: (r) => r.studentName || r.fallbackCode || r.pseudonymId,
    fields: props('studentName', 'studentNumber', 'fallbackCode'),
    allowCopy: false,
    existing: (rows, key) => perExam(rows, (id) => studentRepository.getByExamId(id, key)),
  },
  {
    kind: 'submission',
    payloadKey: 'submissions',
    id: (r) => r.id,
    title: (r) => String(r.pseudonymHash ?? r.id).slice(0, 8),
    fields: {
      ...props('totalScore', 'createdAt'),
      // `r.scanCt`/`annotationCt` are only present on a full fetch; `hasScan`/
      // `hasAnnotations` are the list endpoint's cheap presence flags and stay
      // accurate even when the byte fields were omitted (see
      // submissionRepository's `includeScans`).
      hasScan: (r) => Boolean(r.scanCt) || Boolean(r.hasScan),
      hasAnnotations: (r) => Boolean(r.annotationCt) || Boolean(r.hasAnnotations),
    },
    allowCopy: false,
    existing: (rows, key) => perExam(rows, (id) => submissionRepository.getByExamId(id, key)),
  },
  {
    kind: 'resource',
    payloadKey: 'exerciseResources',
    id: (r) => `${r.exerciseId}:${r.filename}`,
    title: (r) => r.filename,
    fields: props('byteSize'),
    allowCopy: true,
    existing: () => db.exerciseResources.toArray(),
  },
];

function display(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  return String(value);
}

function compare(spec: KindSpec, current: Row, incoming: Row): ArchiveConflict | null {
  const fields = Object.entries(spec.fields).map(([key, read]) => {
    const existing = display(read(current));
    const imported = display(read(incoming));
    return { key, existing, imported, differs: existing !== imported };
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
  };
}

/**
 * Compares an archive against what the target store already holds. Reads go
 * through the repositories, so it asks the store the import will write to.
 * Identical collisions are counted, not returned — they need no decision.
 */
export async function detectConflicts(
  payload: Row,
  key: CryptoKey | null
): Promise<{ conflicts: ArchiveConflict[]; identicalCount: number }> {
  const conflicts: ArchiveConflict[] = [];
  let identicalCount = 0;

  for (const spec of SPECS) {
    const rows: Row[] = payload[spec.payloadKey] ?? [];
    if (rows.length === 0) continue;
    const existing = new Map((await spec.existing(rows, key)).map((r) => [spec.id(r), r]));
    for (const incoming of rows) {
      const current = existing.get(spec.id(incoming));
      if (!current) continue;
      const conflict = compare(spec, current, incoming);
      if (conflict) conflicts.push(conflict);
      else identicalCount++;
    }
  }
  return { conflicts, identicalCount };
}

/** Every conflict gets `choice`; a copy falls back to keep where not allowed. */
export function applyToAll(
  conflicts: ArchiveConflict[],
  choice: ConflictChoice,
  existing: DecisionMap = new Map()
): DecisionMap {
  const decisions = new Map(existing);
  for (const c of conflicts) {
    const effective = choice === 'import-as-copy' && !c.allowCopy ? 'keep-existing' : choice;
    decisions.set(c.id, { id: c.id, kind: c.kind, choice: effective });
  }
  return decisions;
}

/**
 * Rewrites the payload according to the decisions: kept records are dropped,
 * copies get one fresh id that every reference follows.
 *
 * The payload stays loosely typed: the archive is versioned JSON that may carry
 * fields this build does not know, and they must survive the round-trip.
 */
export function applyResolutions(
  payload: Row,
  decisions: DecisionMap
): { payload: Row; idMap: Map<string, string>; skipped: Set<string> } {
  const idMap = new Map<string, string>();
  const skipped = new Set<string>();
  for (const d of decisions.values()) {
    if (d.choice === 'keep-existing') skipped.add(d.id);
    if (d.choice === 'import-as-copy') idMap.set(d.id, crypto.randomUUID());
  }

  const remap = (id: string | undefined) => (id && idMap.get(id)) || id;
  const rewrite = (key: string, idOf: (r: Row) => string, patch: (r: Row) => Row) =>
    ((payload[key] ?? []) as Row[]).filter((r) => !skipped.has(idOf(r))).map((r) => ({ ...r, ...patch(r) }));

  const next: Row = {
    ...payload,
    exams: rewrite('exams', (r) => r.id, (r) => ({ id: remap(r.id) })),
    exercises: rewrite('exercises', (r) => r.id, (r) => ({ id: remap(r.id), examId: remap(r.examId) })),
    examMcGroups: rewrite('examMcGroups', (r) => r.id, (r) => ({ id: remap(r.id), examId: remap(r.examId) })),
    students: rewrite('students', (r) => r.pseudonymId, (r) => ({ examId: remap(r.examId) })),
    submissions: rewrite('submissions', (r) => r.id, (r) => ({ examId: remap(r.examId) })),
    exerciseResources: rewrite(
      'exerciseResources',
      (r) => `${r.exerciseId}:${r.filename}`,
      (r) => ({ exerciseId: remap(r.exerciseId) })
    ),
    exerciseExams: ((payload.exerciseExams ?? []) as Row[])
      .filter((j) => !skipped.has(j.examId) && !skipped.has(j.exerciseId))
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
