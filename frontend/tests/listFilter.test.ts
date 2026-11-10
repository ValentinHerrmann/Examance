import { describe, expect, it } from 'vitest';
import { countOptions, facetOptions, uniqueSorted } from '../src/lib/utils/listFilter';

const items = ['10b', 'Physik', '2a', 'biologie', '10b', 'Ökologie'].map((v) => ({ v }));
const natural = ['2a', '10b', 'biologie', 'Ökologie', 'Physik'];

describe('list filter order (issue #244)', () => {
  it('sorts distinct values naturally and case-insensitively', () => {
    expect(uniqueSorted(items, (i) => i.v)).toEqual(natural);
  });

  it('counts pill options in the same order', () => {
    const options = countOptions(items, (i) => i.v);
    expect(options.map((o) => o.value)).toEqual(natural);
    expect(options.find((o) => o.value === '10b')?.count).toBe(2);
  });

  it('keeps a selected value without matches in order', () => {
    expect(facetOptions(items, (i) => i.v, '3c').map((o) => o.value)).toEqual(['2a', '3c', '10b', 'biologie', 'Ökologie', 'Physik']);
  });
});
