import { describe, it, expect } from 'vitest';
import { MAX_ENTRIES } from '../src/lib/latex/packages';
import { addPackages, bulkChanges, commonValue, type BulkItem } from '../src/lib/bulk/bulkEdit';

const items: BulkItem[] = [
  { id: 'a', title: 'A', values: { topic: 'Bruch', grade: '7' } },
  { id: 'b', title: 'B', values: { topic: 'Bruch', grade: '8' } },
];

describe('commonValue', () => {
  it('returns the shared value, or null when the items differ', () => {
    expect(commonValue(items, 'topic')).toBe('Bruch');
    expect(commonValue(items, 'grade')).toBeNull();
    expect(commonValue(items, 'fach')).toBe('');
  });
});

describe('bulkChanges', () => {
  it('lists only fields that really change per item', () => {
    const result = bulkChanges(items, { grade: '8' });
    expect(result[0].changes).toEqual([{ key: 'grade', from: '7', to: '8' }]);
    expect(result[1].changes).toEqual([]);
  });

  it('treats an emptied field as clearing it', () => {
    expect(bulkChanges(items, { topic: ' ' })[0].changes).toEqual([{ key: 'topic', from: 'Bruch', to: '' }]);
  });
});

describe('addPackages', () => {
  it('adds to an exam that follows the account', () => {
    expect(addPackages(null, [{ kind: 'package', name: 'siunitx', options: '' }])).toEqual({
      entries: [{ kind: 'package', name: 'siunitx', options: '' }],
      error: null,
    });
  });

  it('replaces a same-named entry and a left-out account package', () => {
    const { entries } = addPackages(
      [
        { kind: 'package', name: 'siunitx', options: 'old' },
        { kind: 'package', name: 'tikz', options: '', disabled: true },
        { kind: 'package', name: 'cancel', options: '' },
      ],
      [
        { kind: 'package', name: 'siunitx', options: 'new' },
        { kind: 'package', name: 'tikz', options: '' },
      ],
    );
    expect(entries).toEqual([
      { kind: 'package', name: 'cancel', options: '' },
      { kind: 'package', name: 'siunitx', options: 'new' },
      { kind: 'package', name: 'tikz', options: '' },
    ]);
  });

  it('reports a list that can no longer be stored', () => {
    const letters = (i: number) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const many = Array.from({ length: MAX_ENTRIES }, (_, i) => ({ kind: 'package' as const, name: `pkg${letters(i)}`, options: '' }));
    expect(addPackages(many, [{ kind: 'package', name: 'siunitx', options: '' }]).error).toBe('tooMany');
  });
});
