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
  | 'logos'
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
  'logos',
  'auditLogs',
];

/**
 * `included` (export), `created` (archived id), `newId` (archived id was taken), `linked` (existing exercise reused),
 * `alreadyPresent` (identical, nothing written), `keptExisting`/`replaced`/`copied` (conflict decisions), `failed`
 * (refused by the server or unreadable).
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
 * What an exam refers to that is not there: `exerciseUnavailable` (neither in the archive nor available to the account),
 * `scoresWithoutExercise`, `scanUnreadable` (not decryptable/openable), `examNotImported` (its results had nowhere to
 * go), `logoUnavailable`.
 */
export type MissingReason =
  | 'exerciseUnavailable'
  | 'scoresWithoutExercise'
  | 'scanUnreadable'
  | 'examNotImported'
  | 'logoUnavailable';

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
