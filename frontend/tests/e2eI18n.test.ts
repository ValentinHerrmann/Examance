import { describe, expect, it } from 'vitest';
import { stripDecoration } from '../e2e/helpers/i18n';
import { randomStrings, timeMs } from './helpers/randomStrings';

describe('e2e stripDecoration (SonarCloud S8786)', () => {
  it('drops a required-field marker like the former regex', () => {
    const legacy = (s: string) => s.replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim(); // NOSONAR: the old regex is the oracle
    for (const s of randomStrings(['*', ' ', 'a', '\t', 'Name'], 2000, 8, 11)) {
      expect(stripDecoration(s)).toBe(legacy(s.replace(/^\s*\d+[.)]\s+/, '').replace(/^\s*\+\s*/, '')));
    }
  });

  it('stays linear on long whitespace runs', () => {
    expect(timeMs(() => stripDecoration('a' + ' '.repeat(100_000) + 'b'))).toBeLessThan(200);
  });
});
