/** Stored scan PDFs (issue #220, docs/dev/multi_sheet_exams.md): placeholders for pages not scanned yet, the original A3 scan kept as an attachment, and A3 booklet sheets split into A4 halves. Nothing here ever drops a scanned page. */

import type { PDFDocument, PDFPage, PDFRawStream } from 'pdf-lib';

type PdfLib = typeof import('pdf-lib');

/** Page-dictionary key of a placeholder page; its value is the printed page number it stands for. */
const MISSING_KEY = 'ExamanceMissing';
/** File name of the original A3 scan pages attached to a booklet's scan PDF. */
export const ORIGINAL_SCAN_NAME = 'original-scan.pdf';
const A4: [number, number] = [595.28, 841.89];

/** Appends a placeholder for printed page *page*: says which page is missing and is filled by a later scan of it. */
export async function addPlaceholderPage(lib: PdfLib, doc: PDFDocument, page: number, size: [number, number] = A4): Promise<PDFPage> {
  const placeholder = doc.addPage(size);
  placeholder.node.set(lib.PDFName.of(MISSING_KEY), lib.PDFNumber.of(page));
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const lines = [`Seite ${page} fehlt / Page ${page} missing`, 'Wird beim Scannen dieser Seite ersetzt. / Replaced when this page is scanned.'];
  lines.forEach((text, i) => {
    const sizePt = i === 0 ? 18 : 11;
    const width = font.widthOfTextAtSize(text, sizePt);
    placeholder.drawText(text, { x: (size[0] - width) / 2, y: size[1] / 2 - i * 24, size: sizePt, font, color: lib.rgb(0.4, 0.4, 0.4) });
  });
  return placeholder;
}

/** Printed page number of a placeholder page, or null for a scanned page. */
export function placeholderOf(lib: PdfLib, page: PDFPage): number | null {
  const value = page.node.lookupMaybe(lib.PDFName.of(MISSING_KEY), lib.PDFNumber);
  return value ? value.asNumber() : null;
}

/** Files attached to *doc* (flat name tree, as pdf-lib writes it). */
export function readAttachments(lib: PdfLib, doc: PDFDocument): { name: string; bytes: Uint8Array }[] {
  const names = doc.catalog.lookupMaybe(lib.PDFName.of('Names'), lib.PDFDict);
  const tree = names?.lookupMaybe(lib.PDFName.of('EmbeddedFiles'), lib.PDFDict);
  const list = tree?.lookupMaybe(lib.PDFName.of('Names'), lib.PDFArray);
  if (!list) return [];
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i + 1 < list.size(); i += 2) {
    const name = list.lookup(i);
    const spec = list.lookup(i + 1, lib.PDFDict);
    const stream = spec.lookupMaybe(lib.PDFName.of('EF'), lib.PDFDict)?.lookupMaybe(lib.PDFName.of('F'), lib.PDFStream);
    if (!stream) continue;
    const label = name instanceof lib.PDFString || name instanceof lib.PDFHexString ? name.decodeText() : `attachment-${i / 2 + 1}`;
    files.push({ name: label, bytes: lib.decodePDFRawStream(stream as PDFRawStream).decode() });
  }
  return files;
}

/** Re-attaches every file of *src* to *dst*: a scan rebuilt from pages (split, merge) keeps its original A3 pages. */
export async function carryAttachments(lib: PdfLib, src: PDFDocument, dst: PDFDocument): Promise<void> {
  for (const file of readAttachments(lib, src)) await dst.attach(file.bytes, file.name, { mimeType: 'application/pdf' }); // NOSONAR: attachments keep their order
}

/** Attaches the original A3 pages *refs* (each once, in scan order) as `ORIGINAL_SCAN_NAME`, merged with any original the scan already carries. */
export async function attachOriginals(lib: PdfLib, doc: PDFDocument, refs: readonly { doc: PDFDocument; index: number }[], earlier: PDFDocument | null = null): Promise<void> {
  if (!refs.length) return;
  const original = await lib.PDFDocument.create();
  for (const prior of earlier ? readAttachments(lib, earlier).filter((f) => f.name === ORIGINAL_SCAN_NAME) : []) {
    const src = await lib.PDFDocument.load(prior.bytes); // NOSONAR: earlier originals first, in order
    for (const page of await original.copyPages(src, src.getPageIndices())) original.addPage(page); // NOSONAR: as above
  }
  const seen = new Set<string>();
  for (const ref of refs) {
    const id = `${docId(ref.doc)}:${ref.index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const [page] = await original.copyPages(ref.doc, [ref.index]); // NOSONAR: scan order is the archive's order
    original.addPage(page);
  }
  await doc.attach(await original.save(), ORIGINAL_SCAN_NAME, { mimeType: 'application/pdf', description: 'Original A3 scan (unsplit)' });
}

const docIds = new WeakMap<PDFDocument, number>();
let nextDocId = 0;
function docId(doc: PDFDocument): number {
  const known = docIds.get(doc);
  if (known !== undefined) return known;
  docIds.set(doc, ++nextDocId);
  return nextDocId;
}

/** The page as displayed (after its /Rotate) is wider than tall: possibly an uncut booklet sheet, whatever size the scanner stored. */
export function isLandscape(page: PDFPage): boolean {
  const { width, height } = page.getSize();
  const turned = Math.abs(page.getRotation().angle % 180) === 90;
  return (turned ? height : width) > (turned ? width : height) * 1.2;
}

/** True for a landscape page of about A3 size: an unfolded booklet sheet holding two A4 pages, split without looking at its codes. A4 landscape (842 pt wide) stays whole. */
export function isA3Landscape(page: PDFPage): boolean {
  const { width, height } = page.getSize();
  const turned = Math.abs(page.getRotation().angle % 180) === 90;
  const [w, h] = turned ? [height, width] : [width, height];
  return w > h && w > 1000 && Math.abs(w / h - Math.SQRT2) < 0.08;
}

/** The displayed left and right halves of a landscape page, appended to *into* as lossless page embeds (nothing re-rendered) that keep the page's rotation; left half first. */
export async function splitA3(into: PDFDocument, page: PDFPage): Promise<[number, number]> {
  const { width, height } = page.getSize();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  // Media-box halves holding the displayed left and right halves for each rotation.
  const byX = angle === 0 || angle === 180;
  const low = byX ? { left: 0, bottom: 0, right: width / 2, top: height } : { left: 0, bottom: 0, right: width, top: height / 2 };
  const high = byX ? { left: width / 2, bottom: 0, right: width, top: height } : { left: 0, bottom: height / 2, right: width, top: height };
  const [first, second] = angle === 0 || angle === 90 ? [low, high] : [high, low];
  const size: [number, number] = byX ? [width / 2, height] : [width, height / 2];
  const { degrees } = await import('pdf-lib');
  const [left, right] = await into.embedPages([page, page], [first, second]);
  for (const part of [left, right]) {
    const half = into.addPage(size);
    half.drawPage(part, { x: 0, y: 0 });
    if (angle) half.setRotation(degrees(angle));
  }
  const last = into.getPageCount();
  return [last - 2, last - 1];
}

/** The left or right half of a rendered A3 page, for the QR and OMR passes. */
export function halfImage(image: ImageData, side: 'left' | 'right'): ImageData {
  const w = Math.floor(image.width / 2);
  const x0 = side === 'left' ? 0 : image.width - w;
  const data = new Uint8ClampedArray(w * image.height * 4);
  for (let y = 0; y < image.height; y++) {
    const from = (y * image.width + x0) * 4;
    data.set(image.data.subarray(from, from + w * 4), y * w * 4);
  }
  return { width: w, height: image.height, data, colorSpace: image.colorSpace } as ImageData;
}
