/** Result shares (issue #207): the teacher's list/create/revoke calls and the student's session-less open. Online-only (never the offline queue): a link printed on a slip must exist when it is handed out. Every call is `silentError`; the dialog and the result page report inline. */

import { uint8ArrayToBase64, base64ToUint8Array } from '#lib/crypto/aesGcm';
import type { SealedShare, ShareFactor } from '#lib/sharing/shareCrypto';
import { api } from './client';

const quiet = { silentError: true } as const;

export interface ResultShareInfo {
  id: string;
  studentKey: string;
  factor: ShareFactor;
  size: number;
  createdAt: string;
  expiresAt: string;
  /** False for a share made before objections existed: it has no wrapped key and cannot be updated. */
  updatable: boolean;
  /** The token and content key sealed for this account (`unwrapShareKey`); null when not updatable. */
  wrappedKey: Uint8Array | null;
  contentUpdatedAt: string | null;
  /** Objections accepted until then; null = off. */
  reviewUntil: string | null;
  reviewSubmittedAt: string | null;
  reviewOpenedAt: string | null;
  reviewRepliedAt: string | null;
}

interface ResultShareOut {
  id: string;
  student_key: string;
  factor: ShareFactor;
  size: number;
  created_at: string;
  expires_at: string;
  updatable?: boolean;
  wrapped_key_b64?: string | null;
  content_updated_at?: string | null;
  review_until?: string | null;
  review_submitted_at?: string | null;
  review_opened_at?: string | null;
  review_replied_at?: string | null;
}

interface ReviewOut {
  objection_iv_b64: string | null;
  objection_ct_b64: string | null;
  submitted_at: string | null;
  opened_at: string | null;
  reply_iv_b64: string | null;
  reply_ct_b64: string | null;
  replied_at: string | null;
}

interface ResultShareContent {
  factor: ShareFactor;
  kdf_salt_b64: string | null;
  iv_b64: string;
  ciphertext_b64: string;
  expires_at: string;
  content_updated_at?: string | null;
  review_until?: string | null;
  review?: ReviewOut | null;
}

/** The sealed thread of one share, as the server keeps it (still ciphertext). */
export interface SealedReview {
  objection: { iv: Uint8Array; ciphertext: Uint8Array } | null;
  submittedAt: string | null;
  openedAt: string | null;
  reply: { iv: Uint8Array; ciphertext: Uint8Array } | null;
  repliedAt: string | null;
}

/** One entry of the teacher's list: the thread of a share, under the student's pseudonym. */
export interface ExamReviewInfo extends SealedReview {
  shareId: string;
  studentKey: string;
}

const sealedPart = (iv: string | null, ct: string | null) => (iv && ct ? { iv: base64ToUint8Array(iv), ciphertext: base64ToUint8Array(ct) } : null);

const mapReview = (r: ReviewOut): SealedReview => ({
  objection: sealedPart(r.objection_iv_b64, r.objection_ct_b64),
  submittedAt: r.submitted_at,
  openedAt: r.opened_at,
  reply: sealedPart(r.reply_iv_b64, r.reply_ct_b64),
  repliedAt: r.replied_at,
});

const mapShare = (s: ResultShareOut): ResultShareInfo => ({
  id: s.id,
  studentKey: s.student_key,
  factor: s.factor,
  size: s.size,
  createdAt: s.created_at,
  expiresAt: s.expires_at,
  updatable: s.updatable === true,
  wrappedKey: s.wrapped_key_b64 ? base64ToUint8Array(s.wrapped_key_b64) : null,
  contentUpdatedAt: s.content_updated_at ?? null,
  reviewUntil: s.review_until ?? null,
  reviewSubmittedAt: s.review_submitted_at ?? null,
  reviewOpenedAt: s.review_opened_at ?? null,
  reviewRepliedAt: s.review_replied_at ?? null,
});

export async function listResultShares(examId: string): Promise<ResultShareInfo[]> {
  return (await api.get<ResultShareOut[]>(`/exams/${examId}/shares`, quiet)).map(mapShare);
}

export async function createResultShare(
  examId: string,
  share: { id: string; studentKey: string; lookupHash: string; factor: ShareFactor; expiryDays: number; sealed: SealedShare; wrappedKey?: Uint8Array; reviewUntil?: Date | null }
): Promise<ResultShareInfo> {
  const created = await api.post<ResultShareOut>(
    `/exams/${examId}/shares`,
    {
      id: share.id,
      student_key: share.studentKey,
      lookup_hash: share.lookupHash,
      factor: share.factor,
      kdf_salt_b64: share.sealed.kdfSalt ? uint8ArrayToBase64(share.sealed.kdfSalt) : null,
      iv_b64: uint8ArrayToBase64(share.sealed.iv),
      ciphertext_b64: uint8ArrayToBase64(share.sealed.ciphertext),
      expiry_days: share.expiryDays,
      ...(share.wrappedKey ? { wrapped_key_b64: uint8ArrayToBase64(share.wrappedKey) } : {}),
      ...(share.reviewUntil ? { review_until: share.reviewUntil.toISOString() } : {}),
    },
    quiet
  );
  return mapShare(created);
}

export async function revokeResultShare(examId: string, shareId: string): Promise<void> {
  await api.delete(`/exams/${examId}/shares/${shareId}`, quiet);
}

export async function revokeAllResultShares(examId: string): Promise<void> {
  await api.delete(`/exams/${examId}/shares`, quiet);
}

/** A deleted student's link stops working with them. */
export async function revokeStudentResultShare(examId: string, studentKey: string): Promise<void> {
  await api.delete(`/exams/${examId}/shares?student_key=${studentKey}`, quiet);
}

/** The student's request: no session, only the lookup secret their link derives. */
export async function openResultShare(
  shareId: string,
  lookup: Uint8Array
): Promise<{ factor: ShareFactor; expiresAt: string; sealed: SealedShare; contentUpdatedAt: string | null; reviewUntil: string | null; review: SealedReview | null }> {
  const res = await api.post<ResultShareContent>(`/shares/${shareId}/open`, { lookup_b64: uint8ArrayToBase64(lookup) }, quiet);
  return {
    factor: res.factor,
    expiresAt: res.expires_at,
    contentUpdatedAt: res.content_updated_at ?? null,
    reviewUntil: res.review_until ?? null,
    review: res.review ? mapReview(res.review) : null,
    sealed: {
      kdfSalt: res.kdf_salt_b64 ? base64ToUint8Array(res.kdf_salt_b64) : null,
      iv: base64ToUint8Array(res.iv_b64),
      ciphertext: base64ToUint8Array(res.ciphertext_b64),
    },
  };
}

const sealedBody = (sealed: { iv: Uint8Array; ciphertext: Uint8Array }) => ({ iv_b64: uint8ArrayToBase64(sealed.iv), ciphertext_b64: uint8ArrayToBase64(sealed.ciphertext) });

/** Re-seals the share's content in place (issue #226): same link, new PDF. 409 `ERR_SHARE_NOT_UPDATABLE` for a share made without a wrapped key. */
export async function updateResultShareContent(examId: string, shareId: string, sealed: { iv: Uint8Array; ciphertext: Uint8Array }): Promise<void> {
  await api.put(`/exams/${examId}/shares/${shareId}/content`, sealedBody(sealed), quiet);
}

/** Every objection and reply of the exam, still sealed. */
export async function listExamReviews(examId: string): Promise<ExamReviewInfo[]> {
  const rows = await api.get<(ReviewOut & { share_id: string; student_key: string })[]>(`/exams/${examId}/reviews`, quiet);
  return rows.map((r) => ({ ...mapReview(r), shareId: r.share_id, studentKey: r.student_key }));
}

/** Marks the objection as read, which locks it for the student. */
export async function openShareReview(examId: string, shareId: string): Promise<void> {
  await api.post(`/exams/${examId}/shares/${shareId}/review/open`, {}, quiet);
}

export async function replyToShareReview(examId: string, shareId: string, sealed: { iv: Uint8Array; ciphertext: Uint8Array }): Promise<void> {
  await api.put(`/exams/${examId}/shares/${shareId}/review/reply`, sealedBody(sealed), quiet);
}

/** The student's objection (or a new version of it); 409 `ERR_REVIEW_CLOSED` once the teacher opened it or `review_until` passed. */
export async function submitShareReview(shareId: string, lookup: Uint8Array, sealed: { iv: Uint8Array; ciphertext: Uint8Array }): Promise<void> {
  await api.post(`/shares/${shareId}/review`, { lookup_b64: uint8ArrayToBase64(lookup), ...sealedBody(sealed) }, quiet);
}

export async function withdrawShareReview(shareId: string, lookup: Uint8Array): Promise<void> {
  await api.post(`/shares/${shareId}/review/withdraw`, { lookup_b64: uint8ArrayToBase64(lookup) }, quiet);
}

/** One student's delivery status for result mails and Artemis messages (issue #221). "sent" only means no bounce came back. */
export type DeliveryStatus = 'sent' | 'failed' | 'bounced' | 'delayed';

export interface ResultDeliveryInfo {
  studentKey: string;
  channel: 'email' | 'artemis';
  status: DeliveryStatus;
  /** SMTP status such as `5.1.1`, or the Artemis relay's error text; never an address. */
  detail: string | null;
  updatedAt: string;
  /** Until then the open dialog waits for bounces; later ones are mailed to the teacher. */
  watchUntil: string;
}

interface ResultDeliveryOut {
  student_key: string;
  channel: 'email' | 'artemis';
  status: DeliveryStatus;
  detail: string | null;
  updated_at: string;
  watch_until: string;
}

const mapDelivery = (d: ResultDeliveryOut): ResultDeliveryInfo => ({
  studentKey: d.student_key,
  channel: d.channel,
  status: d.status,
  detail: d.detail,
  updatedAt: d.updated_at,
  watchUntil: d.watch_until,
});

export async function listResultDeliveries(examId: string): Promise<ResultDeliveryInfo[]> {
  return (await api.get<ResultDeliveryOut[]>(`/exams/${examId}/deliveries`, quiet)).map(mapDelivery);
}

/** Has the server read the bounce mailbox now, then lists the statuses. */
export async function checkResultDeliveries(examId: string): Promise<ResultDeliveryInfo[]> {
  return (await api.post<ResultDeliveryOut[]>(`/exams/${examId}/deliveries/check`, {}, quiet)).map(mapDelivery);
}

/** The dialog stops waiting: bounces from now on are mailed to the teacher. */
export async function closeResultDeliveries(examId: string): Promise<void> {
  await api.post(`/exams/${examId}/deliveries/close`, {}, quiet);
}
