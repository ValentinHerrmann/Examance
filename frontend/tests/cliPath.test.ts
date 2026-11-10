import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRONTEND_DIR, resolveInside } from '../scripts/cli-path.mjs';

describe('resolveInside (issue #244)', () => {
  it('resolves arguments inside the base', () => {
    expect(resolveInside(FRONTEND_DIR, 'build')).toBe(path.join(FRONTEND_DIR, 'build'));
    expect(resolveInside(FRONTEND_DIR, '.busytex/core')).toBe(path.join(FRONTEND_DIR, '.busytex', 'core'));
    expect(resolveInside(FRONTEND_DIR, '.')).toBe(FRONTEND_DIR);
  });

  it('refuses paths outside the base, including sibling prefixes', () => {
    expect(() => resolveInside(FRONTEND_DIR, '..')).toThrow();
    expect(() => resolveInside(FRONTEND_DIR, '../backend')).toThrow();
    expect(() => resolveInside(FRONTEND_DIR, '/etc')).toThrow();
    expect(() => resolveInside(FRONTEND_DIR, `${FRONTEND_DIR}-evil`)).toThrow();
  });
});
