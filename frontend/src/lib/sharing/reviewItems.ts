/** The items a student can object to (issue #226, docs/dev/grading_review.md): pure builders, no I/O, so the share flow, the republish and the tests agree on the keys. */

import type { ExerciseRecord, ExerciseScoreRecord } from '#lib/db/schema';
import { buildSubLabelMap } from '#lib/grading/mcGroupLabels';
import { exerciseParts, partOverrideKey } from '#lib/grading/partScores';
import type { ReviewItem } from './shareCrypto';

const DAY_MS = 86_400_000;
/** Objections close this long before the link expires, so the server's own expiry (set a moment later) never undercuts them. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

/** One item per gradable exercise (key = exercise id) and per part (key = `partOverrideKey`); labels are the position number plus the MC sub-label or part letter ("3", "3a"). */
export function buildReviewItems(
  exercises: readonly ExerciseRecord[],
  mcGroups: readonly { memberIds: readonly string[] }[],
  scores: readonly Pick<ExerciseScoreRecord, 'exerciseId' | 'score' | 'partScores'>[]
): ReviewItem[] {
  const letters = buildSubLabelMap(mcGroups);
  const byExercise = new Map(scores.map((sc) => [sc.exerciseId, sc]));
  const items: ReviewItem[] = [];
  for (const ex of exercises) {
    if (!(ex.maxPoints > 0)) continue;
    const sub = letters.get(ex.id) ?? (ex.subIndex ? String.fromCodePoint(96 + ex.subIndex) : '');
    const label = `${ex.orderIndex ?? ''}${sub}`;
    const score = byExercise.get(ex.id);
    items.push({ key: ex.id, label, max: ex.maxPoints, points: score?.score ?? null });
    for (const part of exerciseParts(ex)) {
      items.push({ key: partOverrideKey(ex.id, part.label), label: `${label}${part.label}`, max: part.max, points: score?.partScores?.[part.label] ?? null });
    }
  }
  return items;
}

/** The last moment objections are accepted: the end of the chosen local day, never after the link's expiry (minus a margin). Null for an empty or unusable date. */
export function reviewDeadline(date: string, expiryDays: number, now = new Date()): Date | null {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const end = new Date(y, m - 1, d, 23, 59, 59);
  const cap = new Date(now.getTime() + expiryDays * DAY_MS - EXPIRY_MARGIN_MS);
  const deadline = end < cap ? end : cap;
  return deadline > now ? deadline : null;
}

/** `YYYY-MM-DD` of the local day *days* from *now*, for the date input. */
export function dateInputValue(days: number, now = new Date()): string {
  const d = new Date(now.getTime() + days * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whether *date* (`YYYY-MM-DD`) is today or later and not after the link's expiry day. */
export function reviewDateValid(date: string, expiryDays: number, now = new Date()): boolean {
  return date !== '' && date >= dateInputValue(0, now) && date <= dateInputValue(expiryDays, now);
}
