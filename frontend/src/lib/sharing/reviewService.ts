/** Teacher side of grading reviews (issue #226, docs/dev/grading_review.md): read objections, mark them opened, answer them. Objections are opened with the content key unwrapped from the share, so only this account can read them; the grade page stays pseudonymous. */

import { get } from 'svelte/store';
import { listExamReviews, listResultShares, openShareReview, replyToShareReview, type ResultShareInfo } from '#lib/api/resultShares';
import { joinKey, joinKeys } from '#lib/crypto/pseudonymKey';
import type { GradingReviewItem, GradingReviewRecord, SubmissionRecord } from '#lib/db/schema';
import { reviewStore, type ReviewThread } from '#lib/grading/reviewStore';
import { awaitSessionReady, sessionStore } from '#lib/stores/session';
import { reviewRepository } from '#lib/repositories/reviewRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import type { Locale } from '#lib/i18n/types';
import { mailReviewReply } from './delivery';
import { openReviewPart, sealReviewPart, shareUrl, unwrapShareKey } from './shareCrypto';
import { republishShare } from './shareService';

/** Students are addressed in German unless the teacher says otherwise; the UI language does not decide it. */
const MAIL_LANGUAGE: Locale = 'de';

interface ExamReviews {
  examId: string;
  shares: Map<string, ResultShareInfo>;
  threads: Map<string, ReviewThread>;
  /** `joinKey`s of students with an e-mail address. */
  mailable: Set<string>;
}

let loaded: ExamReviews | null = null;
/** Bumped per `showReview`, so a slow load for an earlier submission cannot overwrite the current one. */
let showSeq = 0;

async function sessionKey(): Promise<CryptoKey> {
  await awaitSessionReady();
  const key = get(sessionStore).sessionKey;
  if (!key) throw new Error('The session is locked.');
  return key;
}

async function openThread(share: ResultShareInfo, row: Awaited<ReturnType<typeof listExamReviews>>[number]): Promise<ReviewThread> {
  const thread: ReviewThread = { shareId: share.id, studentKey: share.studentKey, objections: {}, replies: {}, unreadable: false, submittedAt: row.submittedAt, openedAt: row.openedAt, repliedAt: row.repliedAt };
  if (!share.wrappedKey) return { ...thread, unreadable: true };
  try {
    const { contentKey } = await unwrapShareKey(share.id, share.wrappedKey);
    if (row.objection) thread.objections = (await openReviewPart(share.id, contentKey, 'objection', row.objection.ciphertext, row.objection.iv)).items;
    if (row.reply) {
      const reply = await openReviewPart(share.id, contentKey, 'reply', row.reply.ciphertext, row.reply.iv);
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
  try {
    const key = await sessionKey();
    const [shares, rows, students] = await Promise.all([listResultShares(examId), listExamReviews(examId), studentRepository.getByExamId(examId, key)]);
    const byId = new Map(shares.map((share) => [share.id, share]));
    const threads = new Map<string, ReviewThread>();
    for (const row of rows) {
      const share = byId.get(row.shareId);
      if (share) threads.set(row.studentKey, await openThread(share, row)); // NOSONAR: a handful of objections, opened one after another
    }
    const keys = await joinKeys(students);
    loaded = { examId, shares: byId, threads, mailable: new Set(keys.filter((_, i) => students[i].email)) };
  } catch (err) {
    reviewStore.patch({ error: errorText(err) });
  }
}

/** Forgets the exam's reviews (leaving the grade page). */
export function resetReviews(): void {
  loaded = null;
  showSeq++;
  reviewStore.reset();
}

/** Puts the submission's thread into the store; an unopened objection is marked opened (which locks it for the student) after a fresh read, so the text the teacher sees is the one that got locked. */
export async function showReview(examId: string, sub: SubmissionRecord): Promise<void> {
  const seq = ++showSeq;
  const exam = loaded;
  // A failed load keeps its message in the store.
  if (exam?.examId !== examId) return;
  reviewStore.reset();
  const studentKey = await joinKey(sub);
  let thread = exam.threads.get(studentKey) ?? null;
  if (seq !== showSeq || !thread) return;
  const share = exam.shares.get(thread.shareId);
  try {
    if (share && thread.submittedAt && !thread.openedAt) {
      const fresh = (await listExamReviews(examId)).find((r) => r.shareId === thread?.shareId);
      if (fresh) thread = await openThread(share, fresh);
      if (!thread.unreadable && thread.submittedAt) {
        await openShareReview(examId, thread.shareId);
        thread = { ...thread, openedAt: new Date().toISOString() };
      }
      exam.threads.set(studentKey, thread);
    }
  } catch (err) {
    reviewStore.patch({ error: errorText(err) });
  }
  if (seq !== showSeq) return;
  reviewStore.set({ submissionId: sub.id, thread, canMail: exam.mailable.has(studentKey), drafts: { ...thread.replies }, notify: true, sending: false, error: '', sentAt: null, mailFailed: false });
}

/** Sends the reply: scores are saved by the caller (*flush*), then the record is stored, the graded PDF re-sealed under the same link, the reply stored and, if asked, mailed. Safe to repeat after a failure. */
export async function sendReviewReply(examId: string, sub: SubmissionRecord, flush: () => Promise<void>): Promise<void> {
  const state = get(reviewStore);
  const thread = state.thread;
  const exam = loaded;
  const share = thread && exam?.shares.get(thread.shareId);
  if (!thread || !share || state.submissionId !== sub.id) return;
  reviewStore.patch({ sending: true, error: '', sentAt: null, mailFailed: false });
  try {
    await flush();
    const key = await sessionKey();
    const repliedAt = new Date().toISOString();
    const texts = Object.fromEntries(Object.entries(state.drafts).map(([k, v]) => [k, v.trim()]));
    const published = await republishShare(examId, share, {
      beforeRender: async ({ before, after }) => {
        const label = (k: string) => (after.find((i) => i.key === k) ?? before.find((i) => i.key === k))?.label ?? k;
        const points = (list: typeof after, k: string) => list.find((i) => i.key === k)?.points ?? null;
        const keys = Object.keys({ ...thread.objections, ...texts }).filter((k) => thread.objections[k]?.trim() || texts[k]);
        const items: GradingReviewItem[] = keys.map((k) => ({ key: k, label: label(k), objection: thread.objections[k] ?? '', reply: texts[k] ?? '', pointsBefore: points(before, k), pointsAfter: points(after, k) }));
        const record: GradingReviewRecord = { id: crypto.randomUUID(), submissionId: sub.id, items, submittedAt: thread.submittedAt, repliedAt };
        await reviewRepository.save(examId, record, key);
      },
    });
    const items = Object.fromEntries(
      Object.keys(texts)
        .filter((k) => texts[k] || thread.objections[k]?.trim())
        .map((k) => [k, { text: texts[k] ?? '', pointsBefore: published.before.find((i) => i.key === k)?.points ?? null, pointsAfter: published.after.find((i) => i.key === k)?.points ?? null }])
    );
    await replyToShareReview(examId, share.id, await sealReviewPart(share.id, published.contentKey, 'reply', { items }));
    let mailFailed = false;
    if (state.notify && state.canMail) {
      const expiresAt = new Date(share.expiresAt);
      mailFailed = !(await mailReviewReply({ examId, examTitle: published.examTitle, expiresAt, language: MAIL_LANGUAGE }, published.student, thread.studentKey, shareUrl(location.origin, published.link)));
    }
    const sent: ReviewThread = { ...thread, replies: texts, repliedAt };
    exam?.threads.set(thread.studentKey, sent);
    reviewStore.patch({ thread: sent, sending: false, sentAt: repliedAt, mailFailed });
  } catch (err) {
    reviewStore.patch({ sending: false, error: errorText(err) });
  }
}
