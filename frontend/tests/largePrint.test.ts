import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { scaleToA3 } from '../src/lib/qr/booklet';
import { enlargedPageFactor } from '../src/lib/scan/scanViewport';
import { mergeScannedStudent } from '../src/lib/scan/ingest';
import { studentsStamp } from '../src/lib/exam/examChecks';
import type { StudentRecord } from '../src/lib/db/schema';

const A4 = [595.28, 841.89] as const;
const A3 = [841.89, 1190.55] as const;
const student = (extra: Partial<StudentRecord> = {}): StudentRecord => ({ examId: 'e', pseudonymHmac: 'h', studentName: 'Adam, Lena', piiCt: new Uint8Array(0), piiIv: new Uint8Array(12), ...extra });

describe('large-print A3 copies (issue #265)', () => {
  it('enlarges every A4 page to A3', async () => {
    const src = await PDFDocument.create();
    // A page without content cannot be embedded; a real exam page always has some.
    for (let i = 0; i < 2; i++) src.addPage([...A4]).drawLine({ start: { x: 10, y: 10 }, end: { x: 100, y: 100 } });
    const out = await PDFDocument.load(await scaleToA3(await src.save()));
    expect(out.getPageCount()).toBe(2);
    for (const page of out.getPages()) {
      expect(page.getWidth()).toBeCloseTo(A3[0], 0);
      expect(page.getHeight()).toBeCloseTo(A3[1], 0);
    }
  });

  it('renders an upright A3 scan at A4 geometry, so the alignment marks are where the template expects them', () => {
    expect(A3[0] * enlargedPageFactor(...A3)).toBeCloseTo(A4[0], 1);
    expect(A3[1] * enlargedPageFactor(...A3)).toBeCloseTo(A4[1], 0);
  });

  it('leaves A4, Letter and landscape booklet sheets at their size', () => {
    expect(enlargedPageFactor(...A4)).toBe(1);
    expect(enlargedPageFactor(612, 792)).toBe(1);
    expect(enlargedPageFactor(A3[1], A3[0])).toBe(1);
    // A scanner's slightly larger A4 is no enlargement.
    expect(enlargedPageFactor(610, 860)).toBe(1);
  });

  it('survives a scan and marks printed copies as outdated', () => {
    expect(mergeScannedStudent(student({ largePrint: true }), student()).largePrint).toBe(true);
    expect(studentsStamp([student({ largePrint: true })])).not.toBe(studentsStamp([student()]));
  });
});
