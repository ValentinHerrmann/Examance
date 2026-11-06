import { describe, expect, it } from 'vitest';
import * as lib from 'pdf-lib';
import { ORIGINAL_SCAN_NAME, addPlaceholderPage, attachOriginals, carryAttachments, halfImage, isA3Landscape, isLandscape, placeholderOf, readAttachments, splitA3 } from '../src/lib/scan/scanPdf';

const A3: [number, number] = [1190.55, 841.89];

describe('scan PDFs (issue #220)', () => {
  it('marks placeholders with their printed page and survives a save', async () => {
    const doc = await lib.PDFDocument.create();
    doc.addPage();
    await addPlaceholderPage(lib, doc, 3);
    const back = await lib.PDFDocument.load(await doc.save());
    expect(back.getPages().map((p) => placeholderOf(lib, p))).toEqual([null, 3]);
  });

  it('keeps the original A3 pages through a rebuild of the scan', async () => {
    const original = await lib.PDFDocument.create();
    original.addPage(A3);
    const scan = await lib.PDFDocument.create();
    scan.addPage();
    await attachOriginals(lib, scan, [{ doc: original, index: 0 }, { doc: original, index: 0 }]);
    const rebuilt = await lib.PDFDocument.create();
    await carryAttachments(lib, await lib.PDFDocument.load(await scan.save()), rebuilt);
    const files = readAttachments(lib, await lib.PDFDocument.load(await rebuilt.save()));
    expect(files.map((f) => f.name)).toEqual([ORIGINAL_SCAN_NAME]);
    // The same A3 page attached twice (both halves) is stored once.
    expect((await lib.PDFDocument.load(files[0].bytes)).getPageCount()).toBe(1);
  });

  it('tells A3 booklet sheets from A4 landscape and splits them into two A4 halves', async () => {
    const doc = await lib.PDFDocument.create();
    const a3 = doc.addPage(A3);
    const a4Landscape = doc.addPage([841.89, 595.28]);
    expect(isA3Landscape(a3)).toBe(true);
    expect(isA3Landscape(a4Landscape)).toBe(false);
    const halves = await lib.PDFDocument.create();
    const [left, right] = await splitA3(halves, a3);
    expect([left, right]).toEqual([0, 1]);
    expect(halves.getPage(0).getSize().width).toBeCloseTo(A3[0] / 2);
  });

  // Regression: a scanner stored the uncut sheet as a portrait media box with /Rotate 90, so it was never split.
  it('splits rotated and non-A3 landscape scans along the displayed width', async () => {
    const doc = await lib.PDFDocument.create();
    const rotated = doc.addPage([A3[1], A3[0]]);
    rotated.setRotation(lib.degrees(90));
    const a4Landscape = doc.addPage([841.89, 595.28]);
    const portrait = doc.addPage([595.28, 841.89]);
    expect(isA3Landscape(rotated)).toBe(true);
    expect([isLandscape(a4Landscape), isLandscape(portrait)]).toEqual([true, false]);
    const halves = await lib.PDFDocument.create();
    await splitA3(halves, rotated);
    const half = halves.getPage(0);
    expect(half.getRotation().angle).toBe(90);
    expect(half.getSize().height).toBeCloseTo(A3[0] / 2);
  });

  it('cuts the left and right half of a rendered page', () => {
    const image = { width: 4, height: 1, data: new Uint8ClampedArray([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]) } as ImageData;
    expect(Array.from(halfImage(image, 'left').data)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect(Array.from(halfImage(image, 'right').data)).toEqual([3, 3, 3, 3, 4, 4, 4, 4]);
  });
});
