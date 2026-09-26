import { describe, expect, it } from 'vitest';
import { applyPalette, CHART_PALETTE } from '../src/lib/components/stats/chartExport';
import { gradeBands } from '../src/lib/components/stats/chartColumns';
import type { GradeDistributionBucket } from '../src/lib/analytics/gradingKey';

describe('applyPalette', () => {
  it('replaces every colour token with a literal value', () => {
    const markup = '<line stroke="var(--color-line-strong)"/><rect fill="var(--color-grade-3)"/>';
    const out = applyPalette(markup);
    expect(out).not.toContain('var(');
    expect(out).toContain(CHART_PALETTE['grade-3']);
  });

  it('throws on a token the palette does not know', () => {
    expect(() => applyPalette('<rect fill="var(--color-accent)"/>')).toThrow(/--color-accent/);
  });

  it('covers all six grade colours', () => {
    for (let g = 1; g <= 6; g++) expect(CHART_PALETTE[`grade-${g}`]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('gradeBands labels', () => {
  const bucket = (grade: string, label: string, minPercentage: number, count: number) =>
    ({ grade, label, minPercentage, count, provisionalCount: 0 }) as unknown as GradeDistributionBucket;
  const percent = (f: number) => `${Math.round(f * 100)} %`;
  const num = (v: number) => String(v);

  it('names grade, label and "N (P %)", also for empty grades', () => {
    const bands = gradeBands([bucket('1', 'Sehr gut', 50, 3), bucket('2', 'Gut', 0, 0)], num, percent);
    expect(bands[0].lines).toEqual(['1', 'Sehr gut', '3 (100 %)']);
    expect(bands[1].lines).toEqual(['2', 'Gut', '0 (0 %)']);
  });
});
