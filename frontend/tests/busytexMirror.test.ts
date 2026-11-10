import { describe, expect, it } from 'vitest';
import { withoutTrailingSlashes } from '../scripts/busytex-mirror.mjs';

describe('withoutTrailingSlashes (SonarCloud S8786)', () => {
  it('matches the former /\\/+$/ replace', () => {
    for (const url of ['https://m.test', 'https://m.test/', 'https://m.test///', '', '/', 'a/b/']) {
      expect(withoutTrailingSlashes(url)).toBe(url.replace(/\/+$/, ''));
    }
    expect(withoutTrailingSlashes(undefined)).toBeUndefined();
  });
});
