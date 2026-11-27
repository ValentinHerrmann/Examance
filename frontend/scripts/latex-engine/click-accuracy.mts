// Click-to-source accuracy (issue #347): clicks every printed word of a compiled sample at its centre and counts how often the cursor lands on that exact word.
// Usage: npx vite-node scripts/latex-engine/click-accuracy.mts <sample id> <dir with main.pdf, main.synctex> <words.json>
// words.json: exact word boxes of main.pdf (page, x0, x1, y from the top-left, text), e.g. from pdfminer. The truth for each printed word is its place in a
// word-sequence alignment (LCS) of all printed words against the exercises' source words, so repeated words are judged by their real occurrence.
import fs from 'node:fs';
import path from 'node:path';
import { extractSourceMap } from '#lib/latex/sourceMap';
import { resolveClick, wordAt, type SyncedResult } from '#lib/latex/clickToSource';
import { normalizePrinted, printedView } from '#lib/latex/printedText';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { SAMPLES } from './samples';

interface PdfWord {
  page: number;
  x0: number;
  x1: number;
  y: number;
  text: string;
}
interface SourceWord {
  text: string;
  label: string;
  line: number;
  column: number;
}

const [id, dir, wordsPath] = process.argv.slice(2);
const sample = SAMPLES.find((s) => s.id === id);
if (!sample || !dir || !wordsPath) throw new Error('usage: click-accuracy.mts <sample id> <dir> <words.json>');

// Under Node pdf.js runs its worker in-process; the app's bundled worker URL does not resolve here.
(await loadPdfjs()).GlobalWorkerOptions.workerSrc = path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const map = extractSourceMap(sample.build(sample.exercises));
const bodies = new Map(sample.exercises.map((e) => [e.name, e.body]));
const result: SyncedResult = {
  pdfBytes: new Uint8Array(fs.readFileSync(path.join(dir, 'main.pdf'))),
  synctex: new Uint8Array(fs.readFileSync(path.join(dir, 'main.synctex'))),
  synctexLineShift: Number(process.env.SHIFT ?? 0),
  sourceRanges: map.ranges,
};

// The exercises' printed words in document order.
const source: SourceWord[] = [];
for (const r of map.ranges) {
  const body = bodies.get(r.label);
  if (body === undefined) continue;
  const view = printedView(body.split('\n'));
  for (const m of view.text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const [line, column] = view.at[m.index];
    source.push({ text: m[0], label: r.label, line, column });
  }
}
const printed = (JSON.parse(fs.readFileSync(wordsPath, 'utf8')) as PdfWord[]).map((w) => ({ ...w, text: normalizePrinted(w.text) }));

// LCS alignment of printed words against source words: template words stay unaligned.
const n = printed.length;
const m = source.length;
const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
for (let i = n - 1; i >= 0; i--) {
  for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = printed[i].text === source[j].text ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
}
const truth = new Map<number, SourceWord>();
for (let i = 0, j = 0; i < n && j < m; ) {
  if (printed[i].text === source[j].text) {
    truth.set(i, source[j]);
    i++;
    j++;
  } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
  else j++;
}

// Running text: words of three or more letters (digits and single letters in formulas are ambiguous even for a reader).
const isText = (w: string) => /^\p{L}{3,}$/u.test(w);
let textTotal = 0;
let textExact = 0;
let exact = 0;
let rightLine = 0;
let template = 0;
let wrong = 0;
const misses: string[] = [];
for (const [i, want] of truth) {
  const w = printed[i];
  const click = { page: w.page, x: (w.x0 + w.x1) / 2, y: w.y };
  const probe = await wordAt(result.pdfBytes, click);
  const got = resolveClick(result, click, probe, () => bodies.get(want.label));
  const hit = got?.kind === 'source' && got.label === want.label && got.line === want.line && got.column === want.column;
  if (isText(want.text)) {
    textTotal++;
    if (hit) textExact++;
  }
  if (hit) exact++;
  else if (got?.kind === 'source' && got.label === want.label && got.line === want.line) rightLine++;
  else if (got?.kind !== 'source') template++;
  else wrong++;
  if (!(got?.kind === 'source' && got.line === want.line && got.column === want.column) && misses.length < 40) {
    misses.push(`${want.text} (${want.label} ${want.line}:${want.column}) -> ${got?.kind === 'source' ? `${got.label} ${got.line}:${got.column}` : (got?.kind ?? 'nothing')} probe=${JSON.stringify(probe)}`);
  }
}
const total = truth.size;
const pct = (k: number) => `${((100 * k) / Math.max(1, total)).toFixed(1)} %`;
console.log(JSON.stringify({ sample: id, printedWords: n, sourceWords: m, aligned: total, runningText: `${textExact}/${textTotal} = ${((100 * textExact) / Math.max(1, textTotal)).toFixed(1)} %`, exact: pct(exact), rightLineOtherColumn: pct(rightLine), template: pct(template), wrong: pct(wrong) }));
if (process.env.MISSES) for (const miss of misses) console.log(miss);
