/**
 * What an archive import or export actually did, shown to the user in `ArchiveReportModal` instead
 * of global HTTP error pop-ups. Counts are real outcomes, not archive totals.
 */

export type ReportKind =
  | 'exams'
  | 'exercises'
  | 'mcGroups'
  | 'students'
  | 'submissions'
  | 'scans'
  | 'annotations'
  | 'scores'
  | 'resources'
  | 'auditLogs';

export const REPORT_KINDS: readonly ReportKind[] = [
  'exams',
  'exercises',
  'mcGroups',
  'students',
  'submissions',
  'scans',
  'annotations',
  'scores',
  'resources',
  'auditLogs',
];

/**
 * - `included`: written into the archive (export).
 * - `created`: written under its archived id (import).
 * - `newId`: written under a fresh id because the archived one was taken.
 * - `linked`: an exercise that already exists on the server (own or shared) was reused.
 * - `alreadyPresent`: an identical record existed; nothing was written.
 * - `keptExisting` / `replaced` / `copied`: the user's conflict decisions.
 * - `failed`: the server refused it or it could not be read.
 */
export type ReportOutcome =
  | 'included'
  | 'created'
  | 'newId'
  | 'linked'
  | 'alreadyPresent'
  | 'keptExisting'
  | 'replaced'
  | 'copied'
  | 'failed';

export const REPORT_OUTCOMES: readonly ReportOutcome[] = [
  'included',
  'created',
  'newId',
  'linked',
  'alreadyPresent',
  'keptExisting',
  'replaced',
  'copied',
  'failed',
];

/**
 * Something an exam refers to that is not there:
 * - `exerciseUnavailable`: an exam links an exercise that is neither in the archive nor available
 *   to this account on the server (import), or could not be loaded (export).
 * - `scoresWithoutExercise`: scores for such an exercise, not imported.
 * - `scanUnreadable`: a scan that could not be decrypted (export) or opened (import).
 * - `examNotImported`: results of an exam that was not imported, so they had nowhere to go.
 */
export type MissingReason = 'exerciseUnavailable' | 'scoresWithoutExercise' | 'scanUnreadable' | 'examNotImported';

export interface MissingItem {
  reason: MissingReason;
  /** Exam title (or id) the item belongs to. */
  exam: string;
  /** Exercise name/id or submission id, where it applies. */
  item?: string;
  count?: number;
}

/** What an export deliberately leaves out. */
export type WithheldItem = 'exerciseCode' | 'resourceFiles' | 'omrTemplates';

export interface ArchiveReport {
  direction: 'import' | 'export';
  filename?: string;
  /** The archive carries no exercise code (results only). */
  codeWithheld: boolean;
  counts: Partial<Record<ReportKind, Partial<Record<ReportOutcome, number>>>>;
  missing: MissingItem[];
  withheld: WithheldItem[];
  /** Technical details: refused writes, collected HTTP errors. Shown collapsed. */
  problems: string[];
}

export function newReport(direction: ArchiveReport['direction'], filename?: string): ArchiveReport {
  return { direction, filename, codeWithheld: false, counts: {}, missing: [], withheld: [], problems: [] };
}

export function bump(report: ArchiveReport, kind: ReportKind, outcome: ReportOutcome, n = 1): void {
  if (n <= 0) return;
  const row = (report.counts[kind] ??= {});
  row[outcome] = (row[outcome] ?? 0) + n;
}

export function count(report: ArchiveReport, kind: ReportKind, outcome: ReportOutcome): number {
  return report.counts[kind]?.[outcome] ?? 0;
}

/** Adds a missing item, merging repeats of the same reason/exam/item into one counted line. */
export function addMissing(report: ArchiveReport, item: MissingItem): void {
  const same = report.missing.find(
    (m) => m.reason === item.reason && m.exam === item.exam && m.item === item.item
  );
  if (same) same.count = (same.count ?? 1) + (item.count ?? 1);
  else report.missing.push({ ...item });
}
