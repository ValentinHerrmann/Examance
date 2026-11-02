import { describe, expect, it } from 'vitest';
import * as lib from 'pdf-lib';
import { drawStudentHeader } from '#lib/export/gradedPdf';

async function page() {
  const doc = await lib.PDFDocument.create();
  return { doc, page: doc.addPage([595, 842]), font: await doc.embedFont(lib.StandardFonts.Helvetica) };
}

describe('drawStudentHeader', () => {
  it('stamps names, including letters Helvetica cannot encode and very long ones, without throwing', async () => {
    const { doc, page: p, font } = await page();
    for (const name of ['Müller, Anna', 'Łukasz, Żółć 你好', 'X'.repeat(500)]) drawStudentHeader(lib, p, font, name);
    expect((await doc.save()).length).toBeGreaterThan(0);
  });

  it('draws nothing for an empty name', async () => {
    const { page: p, font } = await page();
    const before = p.node.normalizedEntries().Contents;
    drawStudentHeader(lib, p, font, ' , ');
    expect(p.node.normalizedEntries().Contents).toBe(before);
  });
});
