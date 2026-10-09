import { get } from 'svelte/store';
import { backendStore } from '#lib/stores/backendStore';

/** Retention periods the configured backend enforces (`GET /privacy/retention`), shown in the privacy statement. */
export interface RetentionPeriods {
  graceDays: number;
  auditLogDays: number;
  registrationLinkHours: number;
  pendingAccountDays: number;
  contributionDays: number;
  contributionPendingDays: number;
  trainingSampleDays: number;
}

const FIELDS: Record<keyof RetentionPeriods, string> = {
  graceDays: 'grace_days',
  auditLogDays: 'audit_log_days',
  registrationLinkHours: 'registration_link_hours',
  pendingAccountDays: 'pending_account_days',
  contributionDays: 'contribution_days',
  contributionPendingDays: 'contribution_pending_days',
  trainingSampleDays: 'training_sample_days',
};

/**
 * Null when the backend is unreachable or answers incompletely; the page then states the criteria instead.
 * A plain public fetch: no session needed, and a failure must not open the global error dialog.
 */
export async function fetchRetentionPeriods(): Promise<RetentionPeriods | null> {
  const url = get(backendStore);
  if (!url) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/v1/privacy/retention`, { credentials: 'omit' });
    if (!res.ok) return null;
    const body: Record<string, unknown> = await res.json();
    const periods = {} as RetentionPeriods;
    for (const [key, field] of Object.entries(FIELDS) as [keyof RetentionPeriods, string][]) {
      const value = body[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      periods[key] = value;
    }
    return periods;
  } catch {
    return null;
  }
}
