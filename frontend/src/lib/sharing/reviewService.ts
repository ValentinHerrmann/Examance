/** Teacher side of grading reviews (issue #226, docs/dev/grading_review.md): read objections, mark them opened, answer them. Objections are opened with the content key unwrapped from the share, so only this account can read them; the grade page stays pseudonymous. */

import { get } from 'svelte/store';
import { listExamReviews, listResultShares, openShareReview, replyToShareReview, type ExamReviewInfo, type ResultShareInfo } from '#lib/api/resultShares';
import { joinKey, joinKeys } from '#lib/crypto/pseudonymKey';
import type { GradingReviewItem, GradingReviewRecord, StudentRecord, SubmissionRecord } from '#lib/db/schema';
import { reviewStore, type ReviewThread } from '#lib/grading/reviewStore';
import { loadExamCompileContext } from '#lib/grading/omrTemplatePrep';
import { awaitSessionReady, sessionStore } from '#lib/stores/session';
import { reviewRepository } from '#lib/repositories/reviewRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import type { Locale } from '#lib/i18n/types';
import { translate } from '#lib/i18n';
import { printableItems } from '#lib/export/reviewPrint';
import { mailReviewReply } from './delivery';
import { buildReviewItems } from './reviewItems';
import { saveReviewRecord } from './reviewRecord';
import { openReviewPart, sanitizeObjection, sanitizeReply, sealReviewPart, shareUrl, unwrapShareKey, type ReviewItem } from './shareCrypto';
import { republishShare, type Republished } from './shareService';

/** Students are addressed in German unless the teacher says otherwise; the UI language does not decide it. */
const MAIL_LANGUAGE: Locale = 'de';

interface ExamReviews {
  examId: string;
  shares: Map<string, ResultShareInfo>;
  threads: Map<string, ReviewThread>;
  /** `joinKey`s of students with an e-mail address. */
  mailable: Set<string>;
  /** The exam's item keys: the only keys an objection may carry. */
  itemKeys: ReadonlySet<string>;
}

/** The reply mail that failed, kept so it can be sent again without touching the reply. */
interface PendingMail {
  context: { examId: string; examTitle: string; expiresAt: Date; language: Locale };
  student: StudentRecord;
  studentKey: string;
  url: string;
}

let loaded: ExamReviews | null = null;
let pendingMail: PendingMail | null = null;
/** Bumped per `showReview`, so a slow load for an earlier submission cannot overwrite the current one. */
let showSeq = 0;

async function sessionKey(): Promise<CryptoKey> {
  await awaitSessionReady();
  const key = get(sessionStore).sessionKey;
  if (!key) throw new Error('The session is locked.');
  return key;
}

async function openThread(share: ResultShareInfo, row: ExamReviewInfo, itemKeys: ReadonlySet<string>): Promise<ReviewThread> {
  const thread: ReviewThread = { shareId: share.id, studentKey: share.studentKey, objections: {}, replies: {}, unreadable: false, submittedAt: row.submittedAt, openedAt: row.openedAt, repliedAt: row.repliedAt };
  if (!share.wrappedKey) return { ...thread, unreadable: true };
  try {
    const { contentKey } = await unwrapShareKey(share.id, share.wrappedKey);
    if (row.objection) thread.objections = sanitizeObjection(await openReviewPart(share.id, contentKey, 'objection', row.objection.ciphertext, row.objection.iv), itemKeys).items;
    if (row.reply) {
      const reply = sanitizeReply(await openReviewPart(share.id, contentKey, 'reply', row.reply.ciphertext, row.reply.iv), itemKeys);
      thread.replies = Object.fromEntries(Object.entries(reply.items).map(([k, v]) => [k, v.text]));
    }
  } catch (err) {
    console.warn('A review could not be opened:', err);
    return { ...thread, unreadable: true };
  }
  return thread;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Reads every share, objection and e-mail availability of the exam once for the grade page. */
export async function initReviews(examId: string): Promise<void> {
  loaded = null;
  pendingMail = null;
  try {
    const key = await sessionKey();
    const [shares, rows, students, ctx] = await Promise.all([listResultShares(examId), listExamReviews(examId), studentRepository.getByExamId(examId, key), loadExamCompileContext(examId, key)]);
    if (!ctx) throw new Error(translate('exam.page.examNotFoundOrDeleted'));
    const itemKeys = new Set(buildReviewItems(ctx.exercises, ctx.mcGroups, []).map((item) => item.key));
    const byId = new Map(shares.map((share) => [share.id, share]));
    const threads = new Map<string, ReviewThread>();
    for (const row of rows) {
      const share = byId.get(row.shareId);
      if (share) threads.set(row.studentKey, await openThread(share, row, itemKeys)); // NOSONAR: a handful of objections, opened one after another
    }
    const keys = await joinKeys(students);
    loaded = { examId, shares: byId, threads, mailable: new Set(keys.filter((_, i) => students[i].email)), itemKeys };
  } catch (err) {
    reviewStore.patch({ error: errorText(err) });
  }
}

/** Forgets the exam's reviews (leaving the grade page). */
export function resetReviews(): void {
  loaded = null;
  pendingMail = null;
  showSeq++;
  reviewStore.reset();
}

/** An unopened objection is read fresh and marked opened, which locks it for the student: the text the teacher sees is the one that got locked. A failed call keeps the thread unlocked and reports why. */
async function lockObjection(examId: string, exam: ExamReviews, thread: ReviewThread): Promise<{ thread: ReviewThread; error: string }> {
  const share = exam.shares.get(thread.shareId);
  if (!share || !thread.submittedAt || thread.openedAt) return { thread, error: '' };
  let current = thread;
  try {
    const fresh = (await listExamReviews(examId)).find((r) => r.shareId === thread.shareId);
    if (fresh) current = await openThread(share, fresh, exam.itemKeys);
    if (current.unreadable || !current.submittedAt) return { thread: current, error: '' };
    await openShareReview(examId, thread.shareId);
  } catch (err) {
    return { thread: current, error: errorText(err) };
  }
  const locked = { ...current, openedAt: new Date().toISOString() };
  exam.threads.set(thread.studentKey, locked);
  return { thread: locked, error: '' };
}

/** The objection kept in the submission's record when its link was replaced: answerable, but there is no server thread. */
async function recordThread(examId: string, subId: string, studentKey: string): Promise<ReviewThread | null> {
  const record = await reviewRepository.getBySubmission(examId, subId, await sessionKey());
  const items = printableItems(record?.items ?? []);
  if (!record || items.length === 0) return null;
  const objections = Object.fromEntries(items.map((i) => [i.key, i.objection]));
  const replies = Object.fromEntries(items.filter((i) => i.reply).map((i) => [i.key, i.reply]));
  return { shareId: '', studentKey, objections, replies, unreadable: false, submittedAt: record.submittedAt, openedAt: record.submittedAt, repliedAt: record.repliedAt, fromRecord: true };
}

/** Puts the submission's thread into the store, locking an unopened objection first. */
export async function showReview(examId: string, sub: SubmissionRecord): Promise<void> {
  const seq = ++showSeq;
  const exam = loaded;
  // A failed load keeps its message in the store.
  if (exam?.examId !== examId) return;
  reviewStore.reset();
  const studentKey = await joinKey(sub);
  let thread = exam.threads.get(studentKey) ?? null;
  let error = '';
  try {
    if (thread) ({ thread, error } = await lockObjection(examId, exam, thread));
    else thread = await recordThread(examId, sub.id, studentKey);
  } catch (err) {
    error = errorText(err);
  }
  if (seq !== showSeq || !thread) {
    if (seq === showSeq && error) reviewStore.patch({ error });
    return;
  }
  const lockFailed = Boolean(error) && !thread.openedAt;
  reviewStore.set({ submissionId: sub.id, thread, canMail: exam.mailable.has(studentKey), drafts: { ...thread.replies }, notify: true, sending: false, error, sentAt: null, mailFailed: false, lockFailed });
}

/** Reply texts per item key, trimmed. */
const trimmed = (drafts: Record<string, string>) => Object.fromEntries(Object.entries(drafts).map(([k, v]) => [k, v.trim()]));

/** The record's items for the thread: objections and replies, with the points as published before and after (null when nothing was republished). */
function recordItems(thread: ReviewThread, texts: Record<string, string>, change: { before: ReviewItem[]; after: ReviewItem[] } | null): GradingReviewItem[] {
  const find = (list: ReviewItem[] | undefined, k: string) => list?.find((i) => i.key === k);
  const keys = Object.keys({ ...thread.objections, ...texts }).filter((k) => thread.objections[k]?.trim() || texts[k]);
  return keys.map((k) => ({
    key: k,
    label: (find(change?.after, k) ?? find(change?.before, k))?.label ?? k,
    objection: thread.objections[k] ?? '',
    reply: texts[k] ?? '',
    pointsBefore: find(change?.before, k)?.points ?? null,
    pointsAfter: find(change?.after, k)?.points ?? null,
  }));
}

/** What the student reads per item: the reply text and the points change, with the "before" from the record so a repeated reply still shows the original points. */
function replyPayload(thread: ReviewThread, texts: Record<string, string>, saved: GradingReviewRecord, after: ReviewItem[]) {
  const items = Object.keys(texts)
    .filter((k) => texts[k] || thread.objections[k]?.trim())
    .map((k) => [k, { text: texts[k] ?? '', pointsBefore: saved.items.find((i) => i.key === k)?.pointsBefore ?? null, pointsAfter: after.find((i) => i.key === k)?.points ?? null }] as const);
  return { items: Object.fromEntries(items) };
}

/** The share a reply republishes: the thread's own, or for a kept objection the student's newest link, if any. */
function shareForReply(exam: ExamReviews, thread: ReviewThread): ResultShareInfo | undefined {
  if (!thread.fromRecord) return exam.shares.get(thread.shareId);
  return [...exam.shares.values()].filter((share) => share.studentKey === thread.studentKey && share.updatable).at(-1);
}

/** Sends the reply mail; a mail that fails, in any way, is remembered for `resendReviewMail`. */
async function mailReply(pending: PendingMail): Promise<boolean> {
  try {
    const sent = await mailReviewReply(pending.context, pending.student, pending.studentKey, pending.url);
    pendingMail = sent ? null : pending;
    return !sent;
  } catch (err) {
    console.warn('The reply mail could not be sent:', err);
    pendingMail = pending;
    return true;
  }
}

function pendingMailOf(share: ResultShareInfo, published: Republished, studentKey: string): PendingMail {
  return { context: { examId: loaded?.examId ?? '', examTitle: published.examTitle, expiresAt: new Date(share.expiresAt), language: MAIL_LANGUAGE }, student: published.student, studentKey, url: shareUrl(location.origin, published.link) };
}

/** Stores the record, then republishes the share (which prints the record) and seals the reply for the student; the record's points are the first-recorded ones. */
async function publishReply(examId: string, sub: SubmissionRecord, thread: ReviewThread, share: ResultShareInfo | undefined, texts: Record<string, string>, repliedAt: string): Promise<Republished | null> {
  const key = await sessionKey();
  const kept: { record: GradingReviewRecord | null } = { record: null };
  const save = async (change: { before: ReviewItem[]; after: ReviewItem[] } | null) => {
    kept.record = await saveReviewRecord(examId, { id: crypto.randomUUID(), submissionId: sub.id, items: recordItems(thread, texts, change), submittedAt: thread.submittedAt, repliedAt }, key);
  };
  if (!share) {
    await save(null);
    return null;
  }
  const published = await republishShare(examId, share, { beforeRender: save });
  // A kept objection has no server thread to answer.
  if (kept.record && !thread.fromRecord) {
    await replyToShareReview(examId, share.id, await sealReviewPart(share.id, published.contentKey, 'reply', replyPayload(thread, texts, kept.record, published.after)));
  }
  return published;
}

/** Sends the reply: scores are saved by the caller (*flush*), then the record is stored, the graded PDF re-sealed under the same link, the reply stored and, if asked, mailed. Safe to repeat after a failure. For an objection kept from a replaced link only the record and the student's current link's PDF are updated. */
export async function sendReviewReply(examId: string, sub: SubmissionRecord, flush: () => Promise<void>): Promise<void> {
  const state = get(reviewStore);
  const thread = state.thread;
  const exam = loaded;
  if (!thread || !exam || state.submissionId !== sub.id) return;
  const share = shareForReply(exam, thread);
  if (!share && !thread.fromRecord) return;
  reviewStore.patch({ sending: true, error: '', sentAt: null, mailFailed: false });
  try {
    await flush();
    const texts = trimmed(state.drafts);
    const repliedAt = new Date().toISOString();
    const published = await publishReply(examId, sub, thread, share, texts, repliedAt);
    const wantsMail = state.notify && state.canMail;
    const mailFailed = published && share && wantsMail ? await mailReply(pendingMailOf(share, published, thread.studentKey)) : false;
    const sent: ReviewThread = { ...thread, replies: texts, repliedAt };
    if (!thread.fromRecord) exam.threads.set(thread.studentKey, sent);
    reviewStore.patch({ thread: sent, sending: false, sentAt: repliedAt, mailFailed });
  } catch (err) {
    reviewStore.patch({ sending: false, error: errorText(err) });
  }
}

/** Sends the reply mail again after it failed; the reply itself is already stored and published. */
export async function resendReviewMail(): Promise<void> {
  const pending = pendingMail;
  if (!pending) return;
  reviewStore.patch({ sending: true, error: '' });
  const failed = await mailReply(pending);
  reviewStore.patch({ sending: false, mailFailed: failed });
}

/** Whether any submission of the exam has an objection to print; null when it cannot be read, so the print options stay hidden rather than claiming there are none. */
export async function examHasReviews(examId: string): Promise<boolean | null> {
  try {
    const records = await reviewRepository.listByExam(examId, await sessionKey());
    return records.some((rec) => printableItems(rec.items).length > 0);
  } catch {
    return null;
  }
}

/** The printable objections of one submission, or none when they cannot be read (a download is never blocked by it). */
export async function printableReviewOf(examId: string, submissionId: string): Promise<GradingReviewItem[]> {
  try {
    const record = await reviewRepository.getBySubmission(examId, submissionId, await sessionKey());
    return printableItems(record?.items ?? []);
  } catch {
    return [];
  }
}
