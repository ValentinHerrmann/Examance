/**
 * Sign-in factors and authenticator enrollment.
 *
 * A sign-in presents two of three factors (password, passkey, authenticator).
 * The server answers each step with what is still outstanding, so the client
 * never has to guess what an account has enrolled — and could not find out
 * before proving a factor even if it wanted to.
 */

import { api } from './client';

export type FactorKind = 'password' | 'passkey' | 'totp';

export interface AuthStep {
  id: string;
  email: string;
  role: 'teacher' | 'admin';
  status: 'ok' | 'factor_required' | 'enroll_required';
  satisfied: FactorKind[];
  available: FactorKind[];
}

export interface MfaStatus {
  enrolled: FactorKind[];
  /** Of those, the ones that can also decrypt this account's data. */
  key_capable: FactorKind[];
  required_factor_count: number;
  complete: boolean;
  remaining_backup_codes: number;
}

/** First factor: email + password. */
export async function submitPassword(email: string, password: string): Promise<AuthStep> {
  return api.post<AuthStep>('/auth/login', { email, password }, { silentError: true });
}

/** Second factor: a code from the authenticator app. */
export async function submitTotp(code: string): Promise<AuthStep> {
  return api.post<AuthStep>('/auth/factor/totp', { code }, { silentError: true });
}

/** Second factor: a single-use backup code, standing in for the authenticator. */
export async function submitBackupCode(code: string): Promise<AuthStep> {
  return api.post<AuthStep>('/auth/factor/backup-code', { code }, { silentError: true });
}

export async function fetchMfaStatus(): Promise<MfaStatus> {
  return api.get<MfaStatus>('/mfa/status', { silentError: true });
}

/**
 * Begin enrollment. The returned URI carries the shared secret and is shown
 * once — there is no endpoint that hands it back later.
 */
export async function startTotpEnrollment(): Promise<string> {
  const res = await api.post<{ otpauth_uri: string }>('/mfa/totp/enroll', undefined, {
    silentError: true,
  });
  return res.otpauth_uri;
}

/** Confirm enrollment with a live code. Returns the backup codes, shown once. */
export async function confirmTotpEnrollment(code: string): Promise<string[]> {
  const res = await api.post<{ backup_codes: string[] }>(
    '/mfa/totp/confirm',
    { code },
    { silentError: true },
  );
  return res.backup_codes;
}

export async function regenerateBackupCodes(): Promise<string[]> {
  const res = await api.post<{ backup_codes: string[] }>('/mfa/backup-codes/regenerate', undefined, {
    silentError: true,
  });
  return res.backup_codes;
}

export async function disableTotp(): Promise<void> {
  await api.delete('/mfa/totp', { silentError: true });
}


/**
 * Open a password reset with the emailed token.
 *
 * The token stands in for the password factor — but as one of two. Mailbox
 * access alone completing a reset is the bypass the second factor closes.
 */
export async function startReset(token: string): Promise<AuthStep> {
  return api.post<AuthStep>('/auth/reset/start', { token }, { silentError: true });
}
