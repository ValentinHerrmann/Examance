import { describe, it, expect } from 'vitest';
import { bulkChanges, commonValue, type BulkItem } from '../src/lib/bulk/bulkEdit';

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
