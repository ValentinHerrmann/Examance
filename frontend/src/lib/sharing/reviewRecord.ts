/** The kept side of grading reviews (issue #226, docs/dev/grading_review.md): the `GradingReviewRecord` outlives the link, so every step that would drop or overwrite a link's objection saves it here first. Shared by the reply, the republish, re-sharing and revoking. */

import { listExamReviews, openResultShare, type ExamReviewInfo, type ResultShareInfo } from '#lib/api/resultShares';
import type { GradingReviewItem, GradingReviewRecord } from '#lib/db/schema';
import { translate } from '#lib/i18n';
import { reviewRepository } from '#lib/repositories/reviewRepository';
import { lookupSecret, openReviewPart, openWithKey, sanitizeObjection, unwrapShareKey, type ReviewItem } from './shareCrypto';

/** First write wins for `pointsBefore`: an item already in the record keeps the points it was first recorded with, so a repeated reply or an update before the reply cannot overwrite them with the already-changed ones. A new `pointsAfter` of null keeps the recorded one. */
export function mergeReviewItems(existing: readonly GradingReviewItem[], incoming: readonly GradingReviewItem[]): GradingReviewItem[] {
  const first = new Map(existing.map((item) => [item.key, item]));
  return incoming.map((item) => {
    const prev = first.get(item.key);
    return prev ? { ...item, pointsBefore: prev.pointsBefore, pointsAfter: item.pointsAfter ?? prev.pointsAfter } : item;
  });
}

/** Saves the submission's record under the first-write-wins rule and returns what was stored; an unreadable stored record fails the save instead of being overwritten blind. */
export async function saveReviewRecord(examId: string, record: GradingReviewRecord, key: CryptoKey | null): Promise<GradingReviewRecord> {
  const existing = await reviewRepository.getBySubmission(examId, record.submissionId, key);
  const merged: GradingReviewRecord = { ...record, id: existing?.id ?? record.id, items: mergeReviewItems(existing?.items ?? [], record.items) };
  await reviewRepository.save(examId, merged, key);
  return merged;
}

/** What opening a share's sealed header yields: the key and the items the student saw, with the points as published. */
export interface OpenedShareItems {
  contentKey: Uint8Array;
  items: readonly ReviewItem[];
}

/** The objection as an unanswered record, with the points the student objected to. Items without text are left out. */
export function objectionRecord(submissionId: string, opened: OpenedShareItems, texts: Record<string, string>, submittedAt: string | null): GradingReviewRecord | null {
  const items: GradingReviewItem[] = opened.items
    .filter((item) => texts[item.key]?.trim())
    .map((item) => ({ key: item.key, label: item.label, objection: texts[item.key], reply: '', pointsBefore: item.points, pointsAfter: item.points }));
  return items.length > 0 ? { id: crypto.randomUUID(), submissionId, items, submittedAt, repliedAt: null } : null;
}

/** Saves the share's objection into the student's record (no reply) before the link's content or the link itself changes. Does nothing when the share has no objection or the record is already answered; throws when the objection cannot be read, so the caller leaves the link alone. *rows* are the exam's sealed threads when the caller already has them. */
export async function keepObjection(
  examId: string,
  share: ResultShareInfo,
  submissionId: string,
  key: CryptoKey | null,
  opened?: OpenedShareItems,
  rows?: readonly ExamReviewInfo[]
): Promise<void> {
  if (!share.reviewSubmittedAt) return;
  const existing = await reviewRepository.getBySubmission(examId, submissionId, key);
  if (existing?.repliedAt) return;
  if (!share.wrappedKey) throw new Error(translate('review.errors.notUpdatable'));
  const row = (rows ?? (await listExamReviews(examId))).find((r) => r.shareId === share.id);
  if (!row?.objection) return;
  const source = opened ?? (await openShareItems(share, share.wrappedKey));
  const texts = sanitizeObjection(await openReviewPart(share.id, source.contentKey, 'objection', row.objection.ciphertext, row.objection.iv), source.items.map((i) => i.key)).items;
  const record = objectionRecord(submissionId, source, texts, row.submittedAt);
  if (record) await saveReviewRecord(examId, record, key);
}

/** Opens a share the way its student does (link derived from the wrapped key) to read the items as published. */
async function openShareItems(share: ResultShareInfo, wrapped: Uint8Array): Promise<OpenedShareItems> {
  const { link, contentKey } = await unwrapShareKey(share.id, wrapped);
  const current = await openResultShare(share.id, await lookupSecret(link));
  return { contentKey, items: (await openWithKey(share.id, contentKey, current.sealed)).header.items ?? [] };
}
