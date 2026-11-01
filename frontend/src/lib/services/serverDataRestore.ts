/** "Restore results deleted from the server" (issue #181): the call plus what the Settings card shows. */

import { restoreServerData, type RestoreServerDataResult } from '#lib/api/account';

export interface PurgedExamLine {
  /** Null when the exam list could not be read; the card then shows a generic label. */
  title: string | null;
  purgedAt: string;
}

export interface RestoreReport {
  students: number;
  submissions: number;
  graceDays: number;
  /** Live exams whose older deleted results are gone for good, newest erasure first. */
  purged: PurgedExamLine[];
}

/** Names the purged exams from the account's exam list; ids compare case-insensitively (the server answers canonical UUIDs). */
export function toRestoreReport(
  res: RestoreServerDataResult,
  exams: readonly { id: string; title?: string | null }[]
): RestoreReport {
  const titles = new Map(exams.map((e) => [e.id.toLowerCase(), e.title || null]));
  const purged = res.purged_exams
    .map((p) => ({ title: titles.get(p.exam_id.toLowerCase()) ?? null, purgedAt: p.purged_at }))
    .sort((a, b) => b.purgedAt.localeCompare(a.purgedAt));
  return {
    students: res.restored_student_identities,
    submissions: res.restored_submissions,
    graceDays: res.grace_days,
    purged,
  };
}

/** Restores, then names the exams; a failed exam list only loses the names, never the outcome. */
export async function restoreServerDataReport(
  loadExams: () => Promise<readonly { id: string; title?: string | null }[]>
): Promise<RestoreReport> {
  const res = await restoreServerData();
  const exams = await loadExams().catch(() => []);
  return toRestoreReport(res, exams);
}
