/**
 * Passkey endpoints.
 *
 * A passkey is one of the three sign-in factors and never a shortcut past the
 * two-of-three rule: `/webauthn/login/verify` returns the same auth step shape
 * as any other factor.
 */

import { api } from './client';
import type { AuthStep } from './mfa';

export interface CeremonyOptions {
  handle: string;
  challenge_b64: string;
  options_json: string;
}

export interface PasskeySummary {
  credential_id_b64: string;
  nickname: string | null;
  /** False means this passkey signs in but cannot open the encrypted data. */
  supports_prf: boolean;
  /**
   * The PRF *input*, not its output. Public and fixed per credential, so the
   * same authenticator always derives the same key-encryption key.
   */
  prf_salt_b64: string;
  created_at: string;
  last_used_at: string | null;
}

export async function registrationOptions(): Promise<CeremonyOptions> {
  return api.post<CeremonyOptions>('/webauthn/register/options', undefined, {
    silentError: true,
  });
}

export async function verifyRegistration(payload: {
  handle: string;
  challenge_b64: string;
  credential_json: string;
  supports_prf: boolean;
  nickname: string | null;
}): Promise<PasskeySummary> {
  return api.post<PasskeySummary>('/webauthn/register/verify', payload, { silentError: true });
}

export async function loginOptions(): Promise<CeremonyOptions> {
  return api.post<CeremonyOptions>('/webauthn/login/options', undefined, { silentError: true });
}

export async function verifyLogin(payload: {
  handle: string;
  challenge_b64: string;
  credential_json: string;
}): Promise<AuthStep> {
  return api.post<AuthStep>('/webauthn/login/verify', payload, { silentError: true });
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const res = await api.get<{ credentials: PasskeySummary[] }>('/webauthn/credentials', {
    silentError: true,
  });
  return res.credentials;
}

export async function deletePasskey(credentialIdB64: string): Promise<void> {
  await api.delete(`/webauthn/credentials/${credentialIdB64}`, { silentError: true });
}
