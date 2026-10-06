/**
 * Deleting one's own account (GDPR Art. 17): ask in the settings, confirm through the mailed link.
 * The link's page previews first and deletes only on an explicit click, so a mail scanner opening
 * the link deletes nothing. Every call is `silentError`; the pages report failures inline.
 */

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
