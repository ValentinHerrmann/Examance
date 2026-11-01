/** Deleting one's own account (GDPR Art. 17): ask in the settings, confirm through the mailed link. The link's page previews first and deletes only on an explicit click, so a mail scanner opening the link deletes nothing. Every call is `silentError`; the pages report failures inline. */

import { api } from './client';

export interface AccountDeletionPreview {
  email: string;
  keep_exercises: boolean;
  expires_at: string;
}

/** Mails the confirmation link. @returns how many minutes the link stays valid. */
export async function requestAccountDeletion(keepExercises: boolean): Promise<number> {
  const res = await api.post<{ expires_in_minutes: number }>(
    '/user/me/deletion-request',
    { keep_exercises: keepExercises },
    { silentError: true },
  );
  return res.expires_in_minutes;
}

/** What the link would delete. @throws ApiError `ERR_INVALID_DELETION_TOKEN` when unknown, used or expired. */
export async function previewAccountDeletion(token: string): Promise<AccountDeletionPreview> {
  return api.post<AccountDeletionPreview>('/auth/account-deletion/preview', { token }, { silentError: true });
}

/** Deletes the account behind the link (single use). */
export async function confirmAccountDeletion(token: string): Promise<void> {
  await api.post('/auth/account-deletion/confirm', { token }, { silentError: true });
}

/** A live exam whose deleted results the retention run already erased for good. */
export interface PurgedExamResults {
  exam_id: string;
  purged_at: string;
}

export interface RestoreServerDataResult {
  restored_student_identities: number;
  restored_submissions: number;
  grace_days: number;
  purged_exams: PurgedExamResults[];
}

/** Brings back the server results deleted within the grace period and says which exams' older ones are gone (issue #181). */
export async function restoreServerData(): Promise<RestoreServerDataResult> {
  return api.post<RestoreServerDataResult>('/user/restore-server-data', {}, { silentError: true });
}
