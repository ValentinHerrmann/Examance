import { describe, expect, it } from 'vitest';
import { applyPalette, CHART_PALETTE } from '../src/lib/components/stats/chartExport';
import { gradeBands, gradeColumns } from '../src/lib/components/stats/chartColumns';
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

  it('captions each band like the grade chart, static grade apart from the dynamic count', () => {
    const bands = gradeBands([bucket('1', 'Sehr gut', 50, 3), bucket('2', 'Gut', 0, 0)], num, percent);
    const flat = (o: { text: string; dynamic?: boolean }[]) => o.map((p) => (p.dynamic ? `[${p.text}]` : p.text)).join('');
    expect(bands[0].valueOptions?.map(flat)).toEqual([
      '1 Sehr gut ·\u00a0[3 (100 %)]',
      '1 ·\u00a0[3 (100 %)]',
      '1 ·\u00a0[3]',
      '1',
    ]);
    expect(flat(bands[1].valueOptions?.[0] ?? [])).toBe('2 Gut ·\u00a0[0 (0 %)]');
  });

  it('labels grade ranges upper bound first, the worst grade down to 0 %', () => {
    const cols = gradeColumns([bucket('1', 'Sehr gut', 50, 3), bucket('2', 'Gut', 20, 0)], num, percent);
    expect(cols.map((c) => c.lines[2])).toEqual(['100–50 %', '50–0 %']);
  });
});
