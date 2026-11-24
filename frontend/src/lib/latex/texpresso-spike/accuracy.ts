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

type PageItem = { str: string; transform: number[]; width: number; height: number };

function groupOf(owners: SampleExercise[]): string {
  if (owners.length === 1) return owners[0].name;
  return owners.length === 0 ? '(template)' : '(ambiguous)';
}

/** Where the click at the item's centre lands, graded against the exercises that hold `word`. */
function grade(sync: SyncData, map: SourceMap, exercises: SampleExercise[], page: number, x: number, y: number, word: string, owners: SampleExercise[]): Grade {
  const hit = sourceAt(sync, page, x, y);
  if (!hit) return 'none';
  const loc = hit.file.endsWith('main.tex') ? mapLine(map, hit.line) : null;
  const ex = loc?.label ? exercises.find((e) => e.name === loc.label) : undefined;
  if (!ex || !loc) return 'template';
  if ((ex.body.split('\n')[loc.line - 1] ?? '').includes(word)) return 'exact';
  return owners.includes(ex) ? 'lineOnly' : 'wrong';
}

export async function clickAccuracy(pdf: Uint8Array, sync: SyncData, map: SourceMap, exercises: SampleExercise[]): Promise<AccuracyRow[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: pdf.slice() });
  const rows = new Map<string, AccuracyRow>();
  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const height = page.getViewport({ scale: 1 }).height;
      const { items } = (await page.getTextContent()) as { items: PageItem[] };
      for (const it of items) {
        const word = words(it.str)[0];
        if (!word || !it.width) continue;
        const owners = exercises.filter((e) => e.body.includes(word));
        const g = grade(sync, map, exercises, n, it.transform[4] + it.width / 2, height - it.transform[5] - (it.height || 6) / 3, word, owners);
        const group = groupOf(owners);
        const r = rows.get(group) ?? { group, counts: { exact: 0, lineOnly: 0, template: 0, wrong: 0, none: 0 }, samples: [] };
        rows.set(group, r);
        r.counts[g]++;
        if (g !== 'exact' && r.samples.length < 4) r.samples.push(`${word}→${g}`);
      }
    }
  } finally {
    void task.destroy();
  }
  return [...rows.values()];
}
