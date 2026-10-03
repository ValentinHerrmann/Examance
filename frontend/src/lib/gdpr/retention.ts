/** GDPR retention verification: checks a project/exam retention period against the current date (Art. 5(1)(e)). */

export interface RetentionCheckResult {
  isExpired: boolean;
  expiresAt: string;
  daysRemaining: number;
}

/** Check whether the project/exam exceeded its retention date (`expiresAtIso` is an ISO date or datetime). */
export function checkRetention(expiresAtIso: string): RetentionCheckResult {
  const expiresAt = new Date(expiresAtIso).getTime();
  const now = Date.now();
  const diffMs = expiresAt - now;
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    isExpired: diffMs <= 0,
    expiresAt: expiresAtIso,
    daysRemaining,
  };
}
