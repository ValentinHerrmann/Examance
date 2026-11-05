import { describe, expect, it } from 'vitest';
import { printSettingsOf, stickerPagesOf, stickersPerCopy, type PrintSettings } from '../src/lib/exam/printLayout';

const settings = (patch: Partial<PrintSettings>): PrintSettings => ({ pageCodes: true, padding: 'workspace', layout: 'duplex', mode: 'stickers', stickerSpots: 'sheet', ...patch });

describe('print settings (issue #220)', () => {
  it('reads older exams as the old layout', () => {
    expect(printSettingsOf({})).toEqual({ pageCodes: false, padding: 'none', layout: 'duplex', mode: 'stickers', stickerSpots: 'cover' });
  });

  it('falls back to a spot choice the layout offers', () => {
    expect(printSettingsOf({ printLayout: 'booklet', stickerSpots: 'sheet' }).stickerSpots).toBe('leaf');
    expect(printSettingsOf({ printLayout: 'duplex', stickerSpots: 'a3' }).stickerSpots).toBe('sheet');
  });

  it('puts spots on every sheet front from page 3 (duplex, cut booklet leaves)', () => {
    expect(stickerPagesOf(settings({}), 6)).toEqual([3, 5]);
    expect(stickerPagesOf(settings({ layout: 'booklet', stickerSpots: 'leaf' }), 8)).toEqual([3, 5, 7]);
  });

  it('puts A3 spots on each sheet front right page 2s+1 (first half of the booklet)', () => {
    expect(stickerPagesOf(settings({ layout: 'booklet', stickerSpots: 'a3' }), 8)).toEqual([3]);
    expect(stickerPagesOf(settings({ layout: 'booklet', stickerSpots: 'a3' }), 12)).toEqual([3, 5]);
  });

  it('needs no spots for the cover choice or personalised copies', () => {
    expect(stickerPagesOf(settings({ stickerSpots: 'cover' }), 8)).toEqual([]);
    expect(stickerPagesOf(settings({ mode: 'copies' }), 8)).toEqual([]);
    expect(stickersPerCopy(settings({}), 6)).toBe(3);
  });
});
