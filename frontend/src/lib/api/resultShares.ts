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
}

interface ResultShareOut {
  id: string;
  student_key: string;
  factor: ShareFactor;
  size: number;
  created_at: string;
  expires_at: string;
}

interface ResultShareContent {
  factor: ShareFactor;
  kdf_salt_b64: string | null;
  iv_b64: string;
  ciphertext_b64: string;
  expires_at: string;
}

const mapShare = (s: ResultShareOut): ResultShareInfo => ({
  id: s.id,
  studentKey: s.student_key,
  factor: s.factor,
  size: s.size,
  createdAt: s.created_at,
  expiresAt: s.expires_at,
});

export async function listResultShares(examId: string): Promise<ResultShareInfo[]> {
  return (await api.get<ResultShareOut[]>(`/exams/${examId}/shares`, quiet)).map(mapShare);
}

export async function createResultShare(
  examId: string,
  share: { id: string; studentKey: string; lookupHash: string; factor: ShareFactor; expiryDays: number; sealed: SealedShare }
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
): Promise<{ factor: ShareFactor; expiresAt: string; sealed: SealedShare }> {
  const res = await api.post<ResultShareContent>(`/shares/${shareId}/open`, { lookup_b64: uint8ArrayToBase64(lookup) }, quiet);
  return {
    factor: res.factor,
    expiresAt: res.expires_at,
    sealed: {
      kdfSalt: res.kdf_salt_b64 ? base64ToUint8Array(res.kdf_salt_b64) : null,
      iv: base64ToUint8Array(res.iv_b64),
      ciphertext: base64ToUint8Array(res.ciphertext_b64),
    },
  };
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
