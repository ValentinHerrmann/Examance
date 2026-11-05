import { describe, expect, it } from 'vitest';
import { deliveryBadge } from '#lib/sharing/deliveryBadge';

describe('deliveryBadge', () => {
    it('shows nothing without a delivery', () => expect(deliveryBadge({})).toBeNull());
    it('keeps "sent" while the link is live', () => expect(deliveryBadge({ delivery: { status: 'sent' }, share: {} })).toBe('sent'));
    it('says "revoked" once the link is gone, not "sent"', () => expect(deliveryBadge({ delivery: { status: 'sent' } })).toBe('revoked'));
    it('keeps a failed delivery visible after revoking', () => expect(deliveryBadge({ delivery: { status: 'bounced' } })).toBe('bounced'));
});
