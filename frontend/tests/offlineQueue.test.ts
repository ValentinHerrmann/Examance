import { describe, expect, it } from 'vitest';
import { isTransientError, replayOutcome } from '../src/lib/services/offlineQueue';

const apiError = (status: number, code = 'ERR_UNKNOWN') => Object.assign(new Error(code), { status, code });

describe('offline queue error classes', () => {
  it('queues only failures a replay can fix', () => {
    expect(isTransientError(apiError(0, 'ERR_NETWORK'))).toBe(true);
    expect(isTransientError(apiError(503))).toBe(true);
    expect(isTransientError(apiError(429))).toBe(true);
    expect(isTransientError(apiError(400))).toBe(false);
    expect(isTransientError(apiError(409))).toBe(false);
    expect(isTransientError(new TypeError('bug'))).toBe(false);
  });

  it('keeps entries on auth and server trouble, drops what landed or was refused', () => {
    expect(replayOutcome({ method: 'PUT' }, apiError(502))).toBe('keep');
    expect(replayOutcome({ method: 'PUT' }, apiError(401))).toBe('keep');
    expect(replayOutcome({ method: 'PUT' }, apiError(403, 'ERR_MFA_REQUIRED'))).toBe('keep');
    expect(replayOutcome({ method: 'POST' }, apiError(0, 'ERR_NO_SERVER_URL'))).toBe('keep');
    expect(replayOutcome({ method: 'POST' }, apiError(409))).toBe('applied');
    expect(replayOutcome({ method: 'DELETE' }, apiError(404))).toBe('applied');
    expect(replayOutcome({ method: 'PUT' }, apiError(404))).toBe('rejected');
    expect(replayOutcome({ method: 'PATCH' }, apiError(422))).toBe('rejected');
  });
});
