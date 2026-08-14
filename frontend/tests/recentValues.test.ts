import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentValues, recordValue, removeValue, clearRecentValues } from '../src/lib/utils/recentValues';

const mockStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  },
  length: 0,
  key: () => null,
};

describe('recentValues', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no values stored', () => {
    expect(getRecentValues('testKey')).toEqual([]);
  });

  it('records a value and retrieves it', () => {
    recordValue('testKey', ' 10a ');
    expect(getRecentValues('testKey')).toEqual(['10a']);
  });

  it('ignores empty or whitespace values', () => {
    recordValue('testKey', '  ');
    expect(getRecentValues('testKey')).toEqual([]);
  });

  it('deduplicates existing entries and puts newest at the top', () => {
    recordValue('testKey', '10a');
    recordValue('testKey', '10b');
    recordValue('testKey', '10c');
    expect(getRecentValues('testKey')).toEqual(['10c', '10b', '10a']);

    // Record '10b' again
    recordValue('testKey', '10b');
    expect(getRecentValues('testKey')).toEqual(['10b', '10c', '10a']);
  });

  it('caps items at maxItems', () => {
    for (let i = 1; i <= 20; i++) {
      recordValue('testKey', `val_${i}`, 5);
    }
    const res = getRecentValues('testKey');
    expect(res.length).toBe(5);
    expect(res).toEqual(['val_20', 'val_19', 'val_18', 'val_17', 'val_16']);
  });

  it('clears stored values', () => {
    recordValue('testKey', 'Algebra');
    clearRecentValues('testKey');
    expect(getRecentValues('testKey')).toEqual([]);
  });

  it('removes a specific value', () => {
    recordValue('testKey', '10a');
    recordValue('testKey', '10b');
    recordValue('testKey', '10c');
    const updated = removeValue('testKey', '10b');
    expect(updated).toEqual(['10c', '10a']);
    expect(getRecentValues('testKey')).toEqual(['10c', '10a']);
  });

  it('removes last remaining item cleans up storage', () => {
    recordValue('testKey', '10a');
    removeValue('testKey', '10a');
    expect(getRecentValues('testKey')).toEqual([]);
  });
});
