/** The objections overview of an exam (Results tab, issue #226, docs/dev/grading_review.md): every objection with its conversation, read only. Never marks an objection opened: only the grade page locks it. */

import { joinKey, joinKeys } from '#lib/crypto/pseudonymKey';
import type { GradingReviewRecord, StudentRecord } from '#lib/db/schema';
import type { ReviewThread } from '#lib/grading/reviewStore';
import { printableItems } from '#lib/export/reviewPrint';
import { reviewRepository } from '#lib/repositories/reviewRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { formatStudentName } from '#lib/utils/studentQr';
import { loadReviewSources, openThread, sessionKey } from './reviewService';
import { answeredCount } from './reviewStatus';
import type { ReviewItem } from './shareCrypto';

/** `partial`: replied, but an objected item is still unanswered (issue #280); it counts as open. */
export type ReviewStatus = 'new' | 'opened' | 'partial' | 'answered';

export interface ReviewOverviewItem {
  key: string;
  label: string;
  max: number | null;
  objection: string;
  reply: string;
  pointsBefore: number | null;
  pointsAfter: number | null;
}

export interface ReviewOverviewRow {
  studentKey: string;
  submissionId: string | null;
  /** Shown only when the teacher reveals it; the list itself is pseudonymous. */
  name: string;
  status: ReviewStatus;
  submittedAt: string | null;
  repliedAt: string | null;
  reviewUntil: string | null;
  /** Kept in the results record from a replaced or revoked link. */
  fromRecord: boolean;
  unreadable: boolean;
  items: ReviewOverviewItem[];
  /** Objected items with a reply text or a points change, of all objected items. */
  answered: number;
  total: number;
}

const studentName = (st: StudentRecord | undefined) => (st ? formatStudentName(st.studentName) || st.fallbackCode || '?' : '?');

/** Items of a server thread, with the record's first-recorded points before (first write wins, like `mergeReviewItems`). */
function threadItems(thread: ReviewThread, record: GradingReviewRecord | undefined, labels: Map<string, ReviewItem>): ReviewOverviewItem[] {
  const keys = Object.keys({ ...thread.objections, ...thread.replies }).filter((k) => thread.objections[k]?.trim() || thread.replies[k]?.trim());
  return keys.map((k) => {
    const kept = record?.items.find((i) => i.key === k);
    const points = thread.replyPoints?.[k];
    return { key: k, label: labels.get(k)?.label ?? kept?.label ?? k, max: labels.get(k)?.max ?? null, objection: thread.objections[k] ?? '', reply: thread.replies[k] ?? '', pointsBefore: kept?.pointsBefore ?? points?.before ?? null, pointsAfter: points?.after ?? kept?.pointsAfter ?? null };
  });
}

function recordItems(record: GradingReviewRecord, labels: Map<string, ReviewItem>): ReviewOverviewItem[] {
  return printableItems(record.items).map((i) => ({ ...i, label: labels.get(i.key)?.label ?? i.label, max: labels.get(i.key)?.max ?? null }));
}

/** Status and counts of a row; an unreadable thread is judged by its timestamps alone. */
function statusOf(repliedAt: string | null, openedAt: string | null, items: ReviewOverviewItem[], unreadable: boolean): Pick<ReviewOverviewRow, 'status' | 'answered' | 'total'> {
  const { answered, total } = answeredCount(items);
  if (repliedAt) return { status: unreadable || answered === total ? 'answered' : 'partial', answered, total };
  return { status: openedAt ? 'opened' : 'new', answered, total };
}

/** Sorted: open ones oldest first (they wait longest), answered ones newest first. */
function byUrgency(a: ReviewOverviewRow, b: ReviewOverviewRow): number {
  if ((a.status === 'answered') !== (b.status === 'answered')) return a.status === 'answered' ? 1 : -1;
  if (a.status === 'answered') return (b.repliedAt ?? '').localeCompare(a.repliedAt ?? '');
  return (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '');
}

/** Every objection of the exam: the current link's thread, else the one kept in the submission's record. */
export async function loadReviewOverview(examId: string): Promise<ReviewOverviewRow[]> {
  const key = await sessionKey();
  const [sources, records, submissions] = await Promise.all([loadReviewSources(examId, key), reviewRepository.listByExam(examId, key), submissionRepository.getByExamId(examId, key)]);
  const labels = new Map(sources.items.map((item) => [item.key, item]));
  const shares = new Map(sources.shares.map((share) => [share.id, share]));
  const studentKeys = await joinKeys(sources.students);
  const students = new Map(studentKeys.map((k, i) => [k, sources.students[i]]));
  const subKeys = await Promise.all(submissions.map((sub) => joinKey(sub)));
  const subByKey = new Map(subKeys.map((k, i) => [k, submissions[i].id]));
  const keyBySub = new Map(submissions.map((sub, i) => [sub.id, subKeys[i]]));
  const recordBySub = new Map(records.map((rec) => [rec.submissionId, rec]));
  const rows = new Map<string, ReviewOverviewRow>();
  for (const row of sources.rows) {
    const share = shares.get(row.shareId);
    if (!share || !row.submittedAt) continue;
    const thread = await openThread(share, row, sources.itemKeys); // NOSONAR: a handful of objections, opened one after another
    const submissionId = subByKey.get(row.studentKey) ?? null;
    const record = submissionId ? recordBySub.get(submissionId) : undefined;
    const items = threadItems(thread, record, labels);
    rows.set(row.studentKey, { studentKey: row.studentKey, submissionId, name: studentName(students.get(row.studentKey)), ...statusOf(row.repliedAt, row.openedAt, items, thread.unreadable), submittedAt: row.submittedAt, repliedAt: row.repliedAt, reviewUntil: share.reviewUntil, fromRecord: false, unreadable: thread.unreadable, items });
  }
  for (const record of records) {
    const studentKey = keyBySub.get(record.submissionId);
    const items = record.decryptFailed ? [] : recordItems(record, labels);
    if (!studentKey || rows.has(studentKey) || (items.length === 0 && !record.decryptFailed)) continue;
    rows.set(studentKey, { studentKey, submissionId: record.submissionId, name: studentName(students.get(studentKey)), ...statusOf(record.repliedAt, record.submittedAt, items, Boolean(record.decryptFailed)), submittedAt: record.submittedAt, repliedAt: record.repliedAt, reviewUntil: null, fromRecord: true, unreadable: Boolean(record.decryptFailed), items });
  }
  return [...rows.values()].sort(byUrgency);
}
