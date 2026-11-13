import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/repositories/studentRepository', () => ({
  studentRepository: { getByExamId: vi.fn(async () => { throw new Error('offline'); }) },
}));

import { copiesUnavailable, loadStickerEntries, stickerEntries } from '../src/lib/sharing/stickerEntries';
import { printedLabel } from '../src/lib/qr/stickerSheet';
import type { StudentRecord } from '../src/lib/db/schema';

describe('sticker printing', () => {
  it('reports a failed student read instead of showing "no students yet"', async () => {
    await expect(loadStickerEntries('exam-1', null)).rejects.toThrow('offline');
  });

  it('prints the class-list number before the name, in list order (issue #266)', () => {
    const row = (name: string, extra: Partial<StudentRecord> = {}): StudentRecord => ({ examId: 'e', pseudonymHmac: name, studentName: name, pseudonymRaw: `${name}_1`, piiCt: new Uint8Array(0), piiIv: new Uint8Array(12), ...extra });
    const rows = [row('Berg, Max', { classPosition: 12 }), row('Adam, Lena', { classPosition: 3 })];
    expect(stickerEntries(rows).map((e) => printedLabel(e))).toEqual(['03  Adam, Lena', '12  Berg, Max']);
  });

  it('offers no exam copies for a results-only exam', () => {
    expect(copiesUnavailable([{ codeWithheld: false }])).toBeNull();
    expect(copiesUnavailable([{ codeWithheld: false }, { codeWithheld: true }])).toBeTypeOf('string');
  });
});
