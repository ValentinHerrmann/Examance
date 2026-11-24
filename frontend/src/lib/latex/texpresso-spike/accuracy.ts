/** Click-to-source accuracy of the spike: every pdf.js text item is "clicked" at its centre and graded against the source. */
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { mapLine, type SourceMap } from '#lib/latex/sourceMap';
import { sourceAt, type SyncData } from './synctex';
import type { SampleExercise } from './samples';

export type Grade = 'exact' | 'lineOnly' | 'template' | 'wrong' | 'none';

export interface AccuracyRow {
  /** The exercise the clicked word belongs to ("(template)" when no exercise holds it). */
  group: string;
  counts: Record<Grade, number>;
  samples: string[];
}

const words = (s: string) => s.split(/\s+/).map((w) => w.replace(/[.,;:!?()„“"]+/g, '')).filter((w) => w.length >= 3);

export async function clickAccuracy(pdf: Uint8Array, sync: SyncData, map: SourceMap, exercises: SampleExercise[]): Promise<AccuracyRow[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: pdf.slice() });
  const rows = new Map<string, AccuracyRow>();
  const row = (g: string) => rows.get(g) ?? rows.set(g, { group: g, counts: { exact: 0, lineOnly: 0, template: 0, wrong: 0, none: 0 }, samples: [] }).get(g)!;
  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const height = page.getViewport({ scale: 1 }).height;
      const { items } = (await page.getTextContent()) as { items: { str: string; transform: number[]; width: number; height: number }[] };
      for (const it of items) {
        const word = words(it.str)[0];
        if (!word || !it.width) continue;
        const owners = exercises.filter((e) => e.body.includes(word));
        const group = owners.length === 1 ? owners[0].name : owners.length === 0 ? '(template)' : '(ambiguous)';
        const x = it.transform[4] + it.width / 2;
        const y = height - it.transform[5] - (it.height || 6) / 3;
        const hit = sourceAt(sync, n, x, y);
        const r = row(group);
        let grade: Grade;
        if (!hit) grade = 'none';
        else if (!hit.file.endsWith('main.tex')) grade = 'template';
        else {
          const loc = mapLine(map, hit.line);
          const ex = loc?.label ? exercises.find((e) => e.name === loc.label) : undefined;
          if (!ex || !loc) grade = 'template';
          else if ((ex.body.split('\n')[loc.line - 1] ?? '').includes(word)) grade = 'exact';
          else grade = owners.includes(ex) ? 'lineOnly' : 'wrong';
        }
        r.counts[grade]++;
        if (grade !== 'exact' && r.samples.length < 4) r.samples.push(`${word}→${grade}`);
      }
    }
  } finally {
    void task.destroy();
  }
  return [...rows.values()];
}
