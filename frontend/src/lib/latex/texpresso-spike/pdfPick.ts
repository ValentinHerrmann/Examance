/** The word under a click on a PDF page (pdf.js text content), for the column SyncTeX does not record. */
import { loadPdfjs } from '#lib/pdf/pdfjs';

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** `x`, `y` in PDF points from the page's top-left; returns the word whose glyph box holds the point, or "". */
export async function wordAt(pdf: Uint8Array, page: number, x: number, y: number): Promise<string> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: pdf.slice() });
  try {
    const doc = await task.promise;
    const p = await doc.getPage(page);
    const height = p.getViewport({ scale: 1 }).height;
    const { items } = (await p.getTextContent()) as { items: TextItem[] };
    for (const it of items) {
      if (!it.str || !it.width) continue;
      const left = it.transform[4];
      const baseline = height - it.transform[5];
      const top = baseline - (it.height || Math.abs(it.transform[3]));
      if (x < left || x > left + it.width || y < top - 1 || y > baseline + 2) continue;
      const i = Math.min(it.str.length - 1, Math.floor(((x - left) / it.width) * it.str.length));
      let a = i;
      let b = i;
      while (a > 0 && /\S/.test(it.str[a - 1])) a--;
      while (b < it.str.length && /\S/.test(it.str[b])) b++;
      return it.str.slice(a, b).replace(/[.,;:!?)]+$/, '');
    }
    return '';
  } finally {
    void task.destroy();
  }
}
