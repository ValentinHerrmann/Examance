// Click-to-source accuracy (issue #347): clicks every printed word of a compiled sample and counts how often the cursor lands on the exact clicked character.
// Usage: npx vite-node scripts/latex-engine/click-accuracy.mts <sample id> <dir with main.pdf, main.synctex[, main.prov]> <words.json>
// The dir is node-run.mts's KEEP output for that sample; words.json comes from pdf-words.py (exact pdfminer boxes). COLUMNS=1 uses the engine's
// columns and glyph positions (main.prov), as the app does with the browser engine; without it, the pdf.js path of server compiles is measured. The truth for each printed word is its place in a
// word-sequence alignment (LCS) of all printed words against the exercises' source words, so repeated words are judged by their real occurrence;
// each word is clicked a quarter into its middle character, and only that character's source column counts as exact.
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
  /** Exact character boxes: [x0, x1, text]. */
  chars: [number, number, string][];
}
interface SourceWord {
  text: string;
  label: string;
  /** Source line and column of each printed character of the word. */
  at: [number, number][];
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
  // COLUMNS=1: SyncTeX and main.prov from the provenance engine (packed columns, glyph positions).
  synctexColumns: process.env.COLUMNS === '1',
  provenance: process.env.COLUMNS === '1' ? new Uint8Array(fs.readFileSync(path.join(dir, 'main.prov'))) : undefined,
  sourceRanges: map.ranges,
};

// The exercises' printed words in document order.
const source: SourceWord[] = [];
for (const r of map.ranges) {
  const body = bodies.get(r.label);
  if (body === undefined) continue;
  const view = printedView(body.split('\n'));
  for (const m of view.text.matchAll(/[\p{L}\p{N}]+/gu)) {
    source.push({ text: m[0], label: r.label, at: view.at.slice(m.index, m.index + m[0].length) });
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
  const k = Math.floor(w.chars.length / 2);
  const [cx0, cx1] = w.chars[k] ?? [w.x0, w.x1];
  // A quarter into the character: the cursor goes before it.
  const click = { page: w.page, x: cx0 + (cx1 - cx0) * 0.25, y: w.y };
  const probe = await wordAt(result.pdfBytes, click);
  const got = resolveClick(result, click, probe, () => bodies.get(want.label));
  // A ligature box holds several letters: the truth is the first letter of the clicked box.
  const letter = w.chars.slice(0, k).reduce((sum, c) => sum + normalizePrinted(c[2]).length, 0);
  const [line, column] = want.at[Math.min(letter, want.at.length - 1)];
  const hit = got?.kind === 'source' && got.label === want.label && got.line === line && got.column === column;
  if (isText(want.text)) {
    textTotal++;
    if (hit) textExact++;
  }
  if (hit) exact++;
  else if (got?.kind === 'source' && got.label === want.label && got.line === line) rightLine++;
  else if (got?.kind !== 'source') template++;
  else wrong++;
  if (!hit && misses.length < 40) {
    misses.push(`${want.text}[${k}] (${want.label} ${line}:${column}) -> ${got?.kind === 'source' ? `${got.label} ${got.line}:${got.column}` : (got?.kind ?? 'nothing')} probe=${JSON.stringify(probe)}`);
  }
}
const total = truth.size;
const pct = (k: number) => `${((100 * k) / Math.max(1, total)).toFixed(1)} %`;
console.log(JSON.stringify({ sample: id, printedWords: n, sourceWords: m, aligned: total, runningText: `${textExact}/${textTotal} = ${((100 * textExact) / Math.max(1, textTotal)).toFixed(1)} %`, exact: pct(exact), rightLineOtherColumn: pct(rightLine), template: pct(template), wrong: pct(wrong) }));
if (process.env.MISSES) for (const miss of misses) console.log(miss);
