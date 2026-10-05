/**
 * Account administration (admin only): registrations awaiting approval, invitations, per-account
 * feature switches and the always-allowed domains. Every call is `silentError`; the admin page
 * reports failures inline.
 */

import { api } from './client';

/**
 * The switches an admin sets per account. Exams and exercises always live on the server and need none.
 * Keys mirror `AccountFeatures` in backend/app/schemas/admin.py; the UI renders them in this order.
 */
export const ACCOUNT_FEATURES = ['server_results', 'server_latex'] as const;
export type AccountFeature = (typeof ACCOUNT_FEATURES)[number];
export type AccountFeatures = Record<AccountFeature, boolean>;

export const ALL_FEATURES_ON: AccountFeatures = { server_results: true, server_latex: true };

export interface AdminUser {
  id: string;
  email: string;
  role: 'teacher' | 'admin';
  created_at: string;
  /** Null while the account waits for approval. */
  approved_at: string | null;
  /** The registrant's note for the approving admin; only present while pending. */
  registration_note: string | null;
  features: AccountFeatures;
  /** False for an invitation nobody has accepted yet. */
  password_set: boolean;
}

export interface AllowedDomain {
  id: string;
  domain: string;
  features: AccountFeatures;
  created_at: string;
}

export async function listUsers(status: 'all' | 'pending' | 'active' = 'all'): Promise<AdminUser[]> {
  const res = await api.get<{ items: AdminUser[]; total: number }>(
    `/admin/users?status=${status}&limit=200`,
    { silentError: true },
  );
  return res.items;
}

/** Invites `email`: the account is created approved and receives a set-password link. */
export async function inviteUser(
  email: string,
  role: 'teacher' | 'admin',
  features: AccountFeatures,
): Promise<{ password_reset_sent: boolean }> {
  return api.post('/admin/users', { email, role, features }, { silentError: true });
}

export async function approveUser(id: string, features: AccountFeatures): Promise<AdminUser> {
  return api.post<AdminUser>(`/admin/users/${id}/approve`, { features }, { silentError: true });
}

/** Deletes a pending registration and tells the registrant. */
export async function rejectUser(id: string): Promise<void> {
  await api.post(`/admin/users/${id}/reject`, {}, { silentError: true });
}

export async function updateUserFeatures(id: string, features: Partial<AccountFeatures>): Promise<AdminUser> {
  return api.patch<AdminUser>(`/admin/users/${id}/features`, features, { silentError: true });
}

/** Re-sends the set-password link (for an invitation: the invitation itself). */
export async function resendSetPasswordLink(id: string): Promise<{ password_reset_sent: boolean }> {
  return api.post(`/admin/users/${id}/reset-password`, {}, { silentError: true });
}

export async function listAllowedDomains(): Promise<AllowedDomain[]> {
  return api.get<AllowedDomain[]>('/admin/allowed-domains', { silentError: true });
}

export async function addAllowedDomain(domain: string, features: AccountFeatures): Promise<AllowedDomain> {
  return api.post<AllowedDomain>('/admin/allowed-domains', { domain, features }, { silentError: true });
}

export async function updateAllowedDomain(id: string, features: Partial<AccountFeatures>): Promise<AllowedDomain> {
  return api.patch<AllowedDomain>(`/admin/allowed-domains/${id}`, features, { silentError: true });
}

export async function removeAllowedDomain(id: string): Promise<void> {
  await api.delete(`/admin/allowed-domains/${id}`, { silentError: true });
}
