import { describe, expect, it } from 'vitest';
import type { ResultDeliveryInfo } from '#lib/api/resultShares';
import { bounceWindowEnd } from '#lib/sharing/delivery';
import { latestDeliveries, undelivered } from '#lib/sharing/shareService';

const row = (over: Partial<ResultDeliveryInfo>): ResultDeliveryInfo => ({
  studentKey: 'a'.repeat(64),
  channel: 'email',
  status: 'sent',
  detail: null,
  updatedAt: new Date().toISOString(),
  watchUntil: new Date(Date.now() + 30_000).toISOString(),
  ...over,
});

describe('bounce window (issue #221)', () => {
  it('ends at the latest open e-mail window and ignores Artemis and past ones', () => {
    const later = Date.now() + 25_000;
    expect(bounceWindowEnd([row({ watchUntil: new Date(later).toISOString() }), row({ channel: 'artemis' })])).toBe(later);
    expect(bounceWindowEnd([row({ watchUntil: new Date(Date.now() - 1000).toISOString() })])).toBeNull();
    expect(bounceWindowEnd([])).toBeNull();
  });

  it('counts only bounced and failed deliveries as not reached', () => {
    expect([row({}), row({ status: 'delayed' })].some(undelivered)).toBe(false);
    expect(undelivered(row({ status: 'bounced' }))).toBe(true);
    expect(undelivered(row({ status: 'failed' }))).toBe(true);
    expect(undelivered(undefined)).toBe(false);
  });

  it('keeps the newest status per student', () => {
    const map = latestDeliveries([row({ status: 'failed', channel: 'artemis' }), row({ status: 'sent' })]);
    expect(map.get('a'.repeat(64))?.status).toBe('sent');
  });
});
