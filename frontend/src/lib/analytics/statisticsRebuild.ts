/** When a rebuild may change an exam's kept statistics (issue #238): never from a partial view, so unreadable rows, a browser without the results or an exam whose results retention erased cannot shrink or delete the record. */
import type { MaybeUndecryptable } from '#lib/db/decryptGuard';

export type RebuildAction = 'put' | 'delete' | 'skip';

export interface RebuildView {
  /** Results live in this browser (hybrid). */
  local: boolean;
  /** The server erased the exam's results (retention); counts only where results live on the server. */
  purged: boolean;
  /** Any submission is readable here. */
  hasRows: boolean;
  /** The rows hold at least one graded paper. */
  graded: boolean;
  /** Hybrid: this browser held rows when the teacher's write marked the exam. */
  hadRows: boolean;
  /** The rebuild follows the teacher's own write (not the backfill or an import). */
  clearWhenEmpty: boolean;
  /** Some submission or score did not decrypt, so the rows would drop papers or exercises. */
  unreadable: boolean;
}

export function rebuildAction(view: RebuildView): RebuildAction {
  if (view.unreadable) return 'skip';
  if (!view.local && view.purged) return 'skip';
  if (view.local && !view.hasRows && !view.hadRows) return 'skip';
  if (view.graded) return 'put';
  // Only an exam emptied by the teacher's delete loses its record; ungraded rows (a fresh scan) never clear it.
  return view.clearWhenEmpty && !view.hasRows ? 'delete' : 'skip';
}

/** True when anything the snapshot reads did not decrypt: the exam, one of its exercises, a submission, or a score of one of its exercises. */
export function hasUnreadable(
  exam: MaybeUndecryptable,
  exercises: (MaybeUndecryptable & { id: string })[],
  submissions: MaybeUndecryptable[],
  scores: (MaybeUndecryptable & { exerciseId: string })[],
): boolean {
  const ids = new Set(exercises.map((e) => e.id));
  return Boolean(exam.decryptFailed)
    || exercises.some((e) => e.decryptFailed)
    || submissions.some((s) => s.decryptFailed)
    || scores.some((s) => s.decryptFailed && ids.has(s.exerciseId));
}
