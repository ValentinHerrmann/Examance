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
