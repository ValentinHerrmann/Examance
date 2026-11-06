import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTRA_NOTES, extraNotesKey } from '../src/lib/db/schema';

describe('extraNotesKey', () => {
  // Regression (issue #228): the Layout tab's draft carries fill: true, the stored record omits it; that read as an unsaved change.
  it('treats an absent fill as on', () => {
    expect(extraNotesKey({ ...DEFAULT_EXTRA_NOTES, fill: true })).toBe(extraNotesKey(DEFAULT_EXTRA_NOTES));
  });

  it('tells off from on and from none', () => {
    expect(extraNotesKey({ ...DEFAULT_EXTRA_NOTES, fill: false })).not.toBe(extraNotesKey(DEFAULT_EXTRA_NOTES));
    expect(extraNotesKey(null)).not.toBe(extraNotesKey({ ...DEFAULT_EXTRA_NOTES, fill: false }));
  });
});
