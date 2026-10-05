/**
 * Self-registration (issue #53): request a verification mail, then complete it with a password.
 * Every call is `silentError`; the pages report failures inline. The server answers a request the
 * same way whether or not the address already has an account.
 */

import { api } from './client';

/** Whether this server accepts self-registrations at all (a deployment setting). */
export async function registrationEnabled(): Promise<boolean> {
  const res = await api.get<{ enabled: boolean }>('/auth/register', { silentError: true });
  return res.enabled;
}

/** Asks for a verification link to be mailed to `email`. */
export async function requestRegistration(email: string): Promise<void> {
  await api.post('/auth/register', { email }, { silentError: true });
}

/**
 * Verifies the address with the mailed token and creates the account with `password`.
 * `approved`: the domain is on the admin's always-allowed list, so sign in now.
 * `pending`: an admin has to approve the account first.
 */
export async function completeRegistration(
  token: string,
  password: string,
  note: string,
): Promise<'approved' | 'pending'> {
  const res = await api.post<{ status: 'approved' | 'pending' }>(
    '/auth/register/complete',
    { token, new_password: password, note: note.trim() || null },
    { silentError: true },
  );
  return res.status;
}
