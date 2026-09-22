/**
 * Import conflict detection and resolution.
 *
 * Importing an archive used to be a blind replace. `openBgprojArchive()` wiped
 * the whole workspace before it had even checked the password, and on the
 * server side `createWithIdFallback()` answered a 409 by minting a fresh UUID
 * and carrying on — so re-importing an archive onto the account it came from
 * produced a silent second copy of everything, with no way to tell which copy
 * was which.
 *
 * Conflicts are now found *before* anything is written, presented with both
 * versions side by side, and resolved by the teacher. Nothing is imported until
 * every conflict has a decision.
 */

import { get } from 'svelte/store';
import { db } from '$lib/db/db';
import { storagePolicyStore } from '$lib/stores/storagePolicy';
import { examRepository } from '$lib/repositories/examRepository';
import { exerciseRepository } from '$lib/repositories/exerciseRepository';
import { studentRepository } from '$lib/repositories/studentRepository';
import { submissionRepository } from '$lib/repositories/submissionRepository';
import type { ExamRecord, ExerciseRecord, StudentRecord, SubmissionRecord } from '$lib/db/schema';

export type ConflictKind =
  | 'exam'
  | 'exercise'
  | 'mcGroup'
  | 'student'
  | 'submission'
  | 'resource';

export type ConflictChoice = 'keep-existing' | 'take-imported' | 'import-as-copy';

/** One comparable field, rendered as a row in the side-by-side view. */
export interface ConflictField {
  /** i18n key suffix under `storagePolicy.conflict.field.*`. */
  key: string;
  existing: string | null;
  imported: string | null;
  differs: boolean;
}

export interface ArchiveConflict {
  kind: ConflictKind;
  /** Identity used for matching, and the key decisions are recorded under. */
  id: string;
  /** Short human label for the list. */
  title: string;
  fields: ConflictField[];
  /** A long text worth diffing (LaTeX body, preamble), when the kind has one. */
  textDiff?: { existing: string; imported: string };
  /**
   * False for students, submissions and their scores: a duplicate pseudonym is
   * a data-protection problem, not a convenience, and a duplicated submission
   * would violate the server's (submission, exercise) uniqueness downstream.
   */
  allowCopy: boolean;
  /** True when both sides are byte-identical and no decision is needed. */
  identical: boolean;
}

export interface ConflictDecision {
  id: string;
  kind: ConflictKind;
  choice: ConflictChoice;
  /** Set by `applyResolutions` for `import-as-copy`. */
  newId?: string;
}

export type DecisionMap = Map<string, ConflictDecision>;

export interface ConflictScan {
  /** Conflicts needing a decision, identical ones already excluded. */
  conflicts: ArchiveConflict[];
  /** How many collisions were identical on both sides and skipped. */
  identicalCount: number;
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

function field(key: string, existing: unknown, imported: unknown): ConflictField {
  const a = text(existing);
  const b = text(imported);
  return { key, existing: a, imported: b, differs: a !== b };
}

function buildConflict(
  kind: ConflictKind,
  id: string,
  title: string,
  fields: ConflictField[],
  opts: { allowCopy: boolean; textDiff?: { existing: string; imported: string } }
): ArchiveConflict {
  const textDiffers = opts.textDiff
    ? opts.textDiff.existing !== opts.textDiff.imported
    : false;
  return {
    kind,
    id,
    title,
    fields,
    textDiff: opts.textDiff,
    allowCopy: opts.allowCopy,
    identical: !textDiffers && fields.every((f) => !f.differs),
  };
}

/**
 * Compares an archive against what the target store already holds.
 *
 * Reads through the repositories, so it asks the store the import will actually
 * write to — the server in `all-server`, IndexedDB otherwise.
 */
export async function detectConflicts(
  payload: {
    exams?: ExamRecord[];
    exercises?: ExerciseRecord[];
    examMcGroups?: { id: string; examId: string; title?: string; scoringText?: string }[];
    students?: StudentRecord[];
    submissions?: SubmissionRecord[];
    exerciseResources?: { id: string; exerciseId: string; filename: string; byteSize?: number }[];
  },
  key: CryptoKey | null
): Promise<ConflictScan> {
  const conflicts: ArchiveConflict[] = [];
  let identicalCount = 0;

  const push = (conflict: ArchiveConflict) => {
    if (conflict.identical) identicalCount++;
    else conflicts.push(conflict);
  };

  const incomingExams = payload.exams ?? [];
  const incomingExercises = payload.exercises ?? [];

  if (incomingExams.length > 0) {
    const existing = new Map((await examRepository.getAll(key)).map((e) => [e.id, e]));
    for (const incoming of incomingExams) {
      const current = existing.get(incoming.id);
      if (!current) continue;
      push(
        buildConflict(
          'exam',
          incoming.id,
          incoming.title || incoming.id,
          [
            field('title', current.title, incoming.title),
            field('testart', current.testart, incoming.testart),
            field('fach', current.fach, incoming.fach),
            field('grade', current.grade, incoming.grade),
            field('klasse', current.klasse, incoming.klasse),
            field('datum', current.datum, incoming.datum),
            field('nr', current.nr, incoming.nr),
            field('numVersions', current.numVersions, incoming.numVersions),
            field('retentionUntil', current.retentionUntil, incoming.retentionUntil),
            field(
              'gradingKey',
              current.gradingKey?.preset,
              incoming.gradingKey?.preset
            ),
          ],
          {
            allowCopy: true,
            textDiff: {
              existing: current.latexPreamble ?? '',
              imported: incoming.latexPreamble ?? '',
            },
          }
        )
      );
    }
  }

  if (incomingExercises.length > 0) {
    const existing = new Map((await exerciseRepository.getAll(key)).map((e) => [e.id, e]));
    for (const incoming of incomingExercises) {
      const current = existing.get(incoming.id);
      if (!current) continue;
      push(
        buildConflict(
          'exercise',
          incoming.id,
          incoming.name || incoming.title || incoming.id,
          [
            field('name', current.name, incoming.name),
            field('title', current.title, incoming.title),
            field('version', current.version, incoming.version),
            field('variantKey', current.variantKey, incoming.variantKey),
            field('maxPoints', current.maxPoints, incoming.maxPoints),
            field('questionType', current.questionType, incoming.questionType),
            field('penalty', current.penalty, incoming.penalty),
            field('options', current.options?.join(' | '), incoming.options?.join(' | ')),
            field(
              'correctAnswers',
              current.correctAnswers?.join(', '),
              incoming.correctAnswers?.join(', ')
            ),
          ],
          {
            allowCopy: true,
            textDiff: {
              existing: current.latexBody ?? '',
              imported: incoming.latexBody ?? '',
            },
          }
        )
      );
    }
  }

  const groups = payload.examMcGroups ?? [];
  if (groups.length > 0) {
    const existing = new Map((await db.examMcGroups.toArray()).map((g) => [g.id, g]));
    for (const incoming of groups) {
      const current = existing.get(incoming.id);
      if (!current) continue;
      push(
        buildConflict(
          'mcGroup',
          incoming.id,
          incoming.title || incoming.id,
          [
            field('title', current.title, incoming.title),
            field('scoringText', current.scoringText, incoming.scoringText),
          ],
          { allowCopy: true }
        )
      );
    }
  }

  const students = payload.students ?? [];
  if (students.length > 0) {
    // Per exam, because student identities are scoped to one exam.
    const byExam = new Map<string, StudentRecord[]>();
    for (const st of students) {
      const bucket = byExam.get(st.examId);
      if (bucket) bucket.push(st);
      else byExam.set(st.examId, [st]);
    }
    for (const [examId, incomingList] of byExam) {
      const existing = new Map(
        (await studentRepository.getByExamId(examId, key)).map((s) => [s.pseudonymId, s])
      );
      for (const incoming of incomingList) {
        const current = existing.get(incoming.pseudonymId);
        if (!current) continue;
        push(
          buildConflict(
            'student',
            incoming.pseudonymId,
            incoming.studentName || incoming.fallbackCode || incoming.pseudonymId,
            [
              field('studentName', current.studentName, incoming.studentName),
              field('studentNumber', current.studentNumber, incoming.studentNumber),
              field('fallbackCode', current.fallbackCode, incoming.fallbackCode),
            ],
            // Never a copy: two rows for one pupil is a data-protection
            // problem, not a convenience.
            { allowCopy: false }
          )
        );
      }
    }
  }

  const submissions = payload.submissions ?? [];
  if (submissions.length > 0) {
    const byExam = new Map<string, SubmissionRecord[]>();
    for (const sub of submissions) {
      const bucket = byExam.get(sub.examId);
      if (bucket) bucket.push(sub);
      else byExam.set(sub.examId, [sub]);
    }
    for (const [examId, incomingList] of byExam) {
      const existing = new Map(
        (await submissionRepository.getByExamId(examId, key)).map((s) => [s.id, s])
      );
      for (const incoming of incomingList) {
        const current = existing.get(incoming.id);
        if (!current) continue;
        push(
          buildConflict(
            'submission',
            incoming.id,
            incoming.pseudonymHash.slice(0, 8),
            [
              field('totalScore', current.totalScore, incoming.totalScore),
              field('createdAt', current.createdAt, incoming.createdAt),
              field('hasScan', Boolean(current.scanCt), Boolean(incoming.scanCt)),
              field(
                'hasAnnotations',
                Boolean(current.annotationCt),
                Boolean(incoming.annotationCt)
              ),
            ],
            { allowCopy: false }
          )
        );
      }
    }
  }

  const resources = payload.exerciseResources ?? [];
  if (resources.length > 0) {
    const existing = new Map(
      (await db.exerciseResources.toArray()).map((r) => [`${r.exerciseId}:${r.filename}`, r])
    );
    for (const incoming of resources) {
      const compositeId = `${incoming.exerciseId}:${incoming.filename}`;
      const current = existing.get(compositeId);
      if (!current) continue;
      push(
        buildConflict(
          'resource',
          compositeId,
          incoming.filename,
          [field('byteSize', current.byteSize, incoming.byteSize)],
          { allowCopy: true }
        )
      );
    }
  }

  return { conflicts, identicalCount };
}

/** Every conflict gets the same choice. Backs the "apply to all" control. */
export function applyToAll(
  conflicts: ArchiveConflict[],
  choice: ConflictChoice,
  existing: DecisionMap = new Map()
): DecisionMap {
  const decisions = new Map(existing);
  for (const conflict of conflicts) {
    const effective = choice === 'import-as-copy' && !conflict.allowCopy ? 'keep-existing' : choice;
    decisions.set(conflict.id, { id: conflict.id, kind: conflict.kind, choice: effective });
  }
  return decisions;
}

export interface ResolvedImport {
  /**
   * The payload to write, with copies re-identified and drops removed.
   *
   * Loosely typed on purpose: the archive format is versioned JSON that may
   * carry fields this build does not know about, and they have to survive the
   * round-trip rather than be narrowed away.
   */
  payload: Record<string, any>;
  /** Archived id → the id it was actually written under. */
  idMap: Map<string, string>;
  /** Ids the teacher chose to keep as they are; never written. */
  skipped: Set<string>;
}

/**
 * Rewrites the payload according to the decisions.
 *
 * `import-as-copy` mints its new id here, once, and records it in `idMap` so
 * every reference downstream follows — the old blind retry-under-a-new-UUID in
 * `serverImport` minted ids the rest of the import never learned about.
 */
export function applyResolutions(
  payload: Record<string, any>,
  decisions: DecisionMap
): ResolvedImport {
  const idMap = new Map<string, string>();
  const skipped = new Set<string>();

  for (const decision of decisions.values()) {
    if (decision.choice === 'keep-existing') {
      skipped.add(decision.id);
    } else if (decision.choice === 'import-as-copy') {
      const newId = decision.newId ?? crypto.randomUUID();
      decision.newId = newId;
      idMap.set(decision.id, newId);
    }
  }

  const remap = (id: string | undefined) => (id ? (idMap.get(id) ?? id) : id);
  // Students are keyed by pseudonymId rather than id, so the identity is a
  // callback rather than a field.
  const keep = <T>(items: T[] | undefined, idOf: (item: T) => string): T[] =>
    (items ?? []).filter((item) => !skipped.has(idOf(item)));

  const next: Record<string, any> = { ...payload };

  next.exams = keep(payload.exams, (e: ExamRecord) => e.id).map((e: ExamRecord) => ({
    ...e,
    id: remap(e.id),
  }));
  next.exercises = keep(payload.exercises, (e: ExerciseRecord) => e.id).map(
    (e: ExerciseRecord) => ({ ...e, id: remap(e.id), examId: remap(e.examId) })
  );
  next.examMcGroups = keep(payload.examMcGroups, (g: any) => g.id).map((g: any) => ({
    ...g,
    id: remap(g.id),
    examId: remap(g.examId),
  }));
  next.exerciseExams = (payload.exerciseExams ?? [])
    .filter((j: any) => !skipped.has(j.examId) && !skipped.has(j.exerciseId))
    .map((j: any) => ({
      ...j,
      examId: remap(j.examId),
      exerciseId: remap(j.exerciseId),
      mcGroupId: remap(j.mcGroupId),
    }));
  next.students = keep(payload.students, (s: StudentRecord) => s.pseudonymId).map(
    (s: StudentRecord) => ({ ...s, examId: remap(s.examId) })
  );
  next.submissions = keep(payload.submissions, (s: SubmissionRecord) => s.id).map(
    (s: SubmissionRecord) => ({ ...s, examId: remap(s.examId) })
  );
  next.exerciseResources = (payload.exerciseResources ?? [])
    .filter((r: any) => !skipped.has(`${r.exerciseId}:${r.filename}`))
    .map((r: any) => ({ ...r, exerciseId: remap(r.exerciseId) }));

  // Scores follow their submission; a submission the teacher kept as-is keeps
  // its own scores too, so the archive's are dropped with it.
  const keptSubmissionIds = new Set(next.submissions.map((s: SubmissionRecord) => s.id));
  next.exerciseScores = (payload.exerciseScores ?? [])
    .filter((sc: any) => keptSubmissionIds.has(sc.submissionId))
    .map((sc: any) => ({ ...sc, exerciseId: remap(sc.exerciseId) }));

  return { payload: next, idMap, skipped };
}

/** True when the target store is the server rather than IndexedDB. */
export function targetIsServer(): boolean {
  return get(storagePolicyStore).storageMode !== 'all-local';
}
