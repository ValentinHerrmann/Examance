/**
 * Sign-in factors and authenticator enrollment. A sign-in presents two of three factors
 * (password, passkey, authenticator); the server reports what is outstanding, so the client
 * never learns what an account has enrolled before proving a factor.
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
  /** Whether a usable recovery wrap exists. The code itself is unrecoverable. */
  has_recovery_code: boolean;
  recovery_created_at: string | null;
    /** Per-factor activity. Null means the event predates these fields, not that it never happened. */
  password_changed_at: string | null;
  password_last_used_at: string | null;
  totp_created_at: string | null;
  totp_last_used_at: string | null;
}

/** First factor: email + password. */
export async function submitPassword(email: string, password: string): Promise<AuthStep> {
  return api.post<AuthStep>('/auth/login', { email, password }, { silentError: true });
}

/**
 * The password as the *second* factor. Unlike `submitPassword` it sends no email: the account is
 * the one the pending token names, and an address here would turn step two into an account probe.
 */
export async function submitPasswordFactor(password: string): Promise<AuthStep> {
  return api.post<AuthStep>('/auth/factor/password', { password }, { silentError: true });
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

/** Begin enrollment. The returned URI carries the shared secret and is shown once; no endpoint returns it later. */
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
 * Change the password of a signed-in account. The re-wrapped envelope set travels with it so the
 * server writes password and key copy in one transaction and they cannot disagree.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  envelope: Record<string, unknown> | null,
): Promise<void> {
  await api.post(
    '/auth/change-password',
    { current_password: currentPassword, new_password: newPassword, envelope },
    { silentError: true },
  );
}


/**
 * Open a password reset with the emailed token. It counts as the password factor, but only one
 * of two: mailbox access alone completing a reset is the bypass the second factor closes.
 */
export async function startReset(token: string): Promise<AuthStep> {
  return api.post<AuthStep>('/auth/reset/start', { token }, { silentError: true });
}
