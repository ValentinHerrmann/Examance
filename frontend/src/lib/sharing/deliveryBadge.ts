import type { DeliveryStatus } from '#lib/api/resultShares';

export type DeliveryBadge = DeliveryStatus | 'revoked';

/** What the Share table shows in "Zustellung": a failed delivery always (it needs action); "sent" only while the link still works, else "revoked" (revoked or expired, the API keeps no record of which); nothing without a delivery. */
export function deliveryBadge(student: { delivery?: { status: DeliveryStatus }; share?: unknown }): DeliveryBadge | null {
    const d = student.delivery;
    if (!d) return null;
    if (d.status === 'failed' || d.status === 'bounced') return d.status;
    return student.share ? d.status : 'revoked';
}
