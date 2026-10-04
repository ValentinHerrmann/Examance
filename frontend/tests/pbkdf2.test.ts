import { describe, it, expect } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS_LEGACY,
  derivePbkdf2Key,
} from '../src/lib/crypto/keyDerivation';

// Kept from the local-vault tests when local mode was discontinued (issue #47): the PBKDF2 fallback
// still derives account keys.
const PASSPHRASE = 'correct-horse-battery-staple';

describe('PBKDF2 parameters', () => {
  it('uses the OWASP 2024 iteration count by default', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    expect(PBKDF2_ITERATIONS_LEGACY).toBe(1_000);
  });

  it('derives a different key at the legacy iteration count', async () => {
    const salt = new Uint8Array(16).fill(7);
    const current = await derivePbkdf2Key(PASSPHRASE, salt);
    const legacy = await derivePbkdf2Key(PASSPHRASE, salt, PBKDF2_ITERATIONS_LEGACY);

    expect(Array.from(current.rawKey)).not.toEqual(Array.from(legacy.rawKey));
  });
});
