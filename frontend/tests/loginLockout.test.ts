import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  formatRemaining,
  loginLockout,
  remainingSeconds,
} from '../src/lib/stores/loginLockout';

describe('login lockout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loginLockout.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down from the cooloff the server reported', () => {
    loginLockout.start(90);
    expect(remainingSeconds(get(loginLockout).lockedUntil)).toBe(90);

    vi.advanceTimersByTime(30_000);
    expect(remainingSeconds(get(loginLockout).lockedUntil)).toBe(60);

    vi.advanceTimersByTime(60_000);
    expect(remainingSeconds(get(loginLockout).lockedUntil)).toBe(0);
  });

  it('ignores a cooloff that is absent or nonsense', () => {
    // A 429 without a usable Retry-After falls back to the generic message
    // rather than showing a countdown to nothing.
    loginLockout.start(0);
    loginLockout.start(Number.NaN);
    loginLockout.start(-5);
    expect(get(loginLockout).lockedUntil).toBeNull();
  });

  it('reports nothing left when no lock is held', () => {
    expect(remainingSeconds(null)).toBe(0);
  });

  it('formats as m:ss across the whole one-minute to one-hour range', () => {
    // LOGIN_LOCKOUT_BASE_SECONDS is 60 and the cap is 3600, so both ends matter.
    expect(formatRemaining(59)).toBe('0:59');
    expect(formatRemaining(60)).toBe('1:00');
    expect(formatRemaining(605)).toBe('10:05');
    expect(formatRemaining(3600)).toBe('60:00');
  });

  it('a later, shorter cooloff replaces the earlier one', () => {
    // Attempting during a lock is refused before the failure is counted, so the
    // server reports the *remaining* time — which must not read as a fresh wait.
    loginLockout.start(600);
    vi.advanceTimersByTime(120_000);
    loginLockout.start(480);
    expect(remainingSeconds(get(loginLockout).lockedUntil)).toBe(480);
  });
});
