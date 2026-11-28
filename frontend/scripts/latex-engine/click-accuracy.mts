// Click-to-source accuracy (issue #347): clicks every printed word of a compiled sample and counts how often the cursor lands on the exact clicked character.
// Usage: npx vite-node scripts/latex-engine/click-accuracy.mts <sample id> <dir with main.pdf, main.synctex[, main.prov]> <words.json>
// The dir is node-run.mts's KEEP output for that sample; words.json comes from pdf-words.py (exact pdfminer boxes). COLUMNS=1 uses the engine's
// columns and glyph positions (main.prov), as the app does with the browser engine; without it, the pdf.js path of server compiles is measured. The truth for each printed word is its place in a
// word-sequence alignment (LCS) of all printed words against the exercises' source words, so repeated words are judged by their real occurrence;
// each word is clicked a quarter into its middle character (into the first letter of a ligature), and only that character's source column counts as exact.
// Exits non-zero unless at least 90 % of the words land in the right exercise and none in a wrong one (issue #350); TikZ labels and single letters or digits in formulas are reported on their own.
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
  kind: 'tikz' | 'math' | 'other';
}

/** Body ranges [start, end) of TikZ pictures and of formulas, as offsets into the body. */
function bodyRanges(body: string): { tikz: [number, number][]; math: [number, number][] } {
  const spans = (re: RegExp) => [...body.matchAll(re)].map((m): [number, number] => [m.index, m.index + m[0].length]);
  return {
    tikz: spans(/\\begin\{(tikzpicture|circuitikz)\}[\s\S]*?\\end\{\1\}/g),
    math: spans(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g),
  };
}

/** The bucket of a source word: inside a TikZ picture, a single letter or digits inside a formula, or anything else. */
function kindOf(body: string, at: [number, number], word: string): SourceWord['kind'] {
  const lines = body.split('\n');
  let offset = at[1];
  for (let i = 0; i < at[0] - 1; i++) offset += lines[i].length + 1;
  const { tikz, math } = bodyRanges(body);
  const inside = (ranges: [number, number][]) => ranges.some(([a, b]) => offset >= a && offset < b);
  if (inside(tikz)) return 'tikz';
  if (/^(\p{L}|\p{N}+)$/u.test(word) && inside(math)) return 'math';
  return 'other';
}

const [id, dir, wordsPath] = process.argv.slice(2);
const sample = SAMPLES.find((s) => s.id === id);
if (!sample || !dir || !wordsPath) throw new Error('usage: click-accuracy.mts <sample id> <dir> <words.json>');

// Under Node pdf.js runs its worker in-process; the app's bundled worker URL does not resolve here.
(await loadPdfjs()).GlobalWorkerOptions.workerSrc = path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const map = extractSourceMap(sample.build(sample.exercises));
const bodies = new Map(sample.exercises.map((e) => [e.name, e.body]));
// Bodies by the id the builder marked them with, as the app's editor and Exam step answer them.
const bodyById = new Map(map.ranges.map((r) => [r.exerciseId, bodies.get(r.label)]));
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
    const at = view.at.slice(m.index, m.index + m[0].length);
    source.push({ text: m[0], label: r.label, at, kind: kindOf(body, at[0], m[0]) });
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
// A lone letter or number aligns anywhere (exercise numbers and points in the template matched digits of an exercise): it counts only in a run of
// consecutive aligned words (consecutive in print and in source) that also holds a longer word. TikZ labels are placed freely and stay.
const lone = (w: SourceWord) => w.kind !== 'tikz' && /^(\p{L}|\p{N}+)$/u.test(w.text);
const sourceIndex = new Map([...truth].map(([i, w]) => [i, source.indexOf(w)]));
const pairs = [...truth.keys()].sort((a, b) => a - b);
for (let start = 0; start < pairs.length; ) {
  let end = start + 1;
  while (end < pairs.length && pairs[end] === pairs[end - 1] + 1 && sourceIndex.get(pairs[end]) === sourceIndex.get(pairs[end - 1])! + 1) end++;
  const run = pairs.slice(start, end);
  if (run.every((i) => lone(truth.get(i)!))) for (const i of run) truth.delete(i);
  start = end;
}

// Running text: words of three or more letters (digits and single letters in formulas are ambiguous even for a reader).
const isText = (w: string) => /^\p{L}{3,}$/u.test(w);
let textTotal = 0;
let textExact = 0;
let exact = 0;
let rightLine = 0;
let template = 0;
let otherLine = 0;
let wrongExercise = 0;
const buckets = { tikz: { total: 0, exercise: 0 }, math: { total: 0, exercise: 0 } };
const misses: string[] = [];
for (const [i, want] of truth) {
  const w = printed[i];
  const k = Math.floor(w.chars.length / 2);
  const [cx0, cx1, ctext] = w.chars[k] ?? [w.x0, w.x1, w.text];
  // A quarter into the character (into the first letter of a ligature box): the cursor goes before it.
  const letters = Math.max(1, normalizePrinted(ctext).length);
  const click = { page: w.page, x: cx0 + ((cx1 - cx0) * 0.25) / letters, y: w.y };
  const probe = await wordAt(result.pdfBytes, click); // NOSONAR: one click after the other, in order, on one cached pdf.js document
  const got = resolveClick(result, click, probe, (id) => bodyById.get(id));
  // A ligature box holds several letters: the truth is the first letter of the clicked box.
  const letter = w.chars.slice(0, k).reduce((sum, c) => sum + normalizePrinted(c[2]).length, 0);
  const [line, column] = want.at[Math.min(letter, want.at.length - 1)];
  const hit = got?.kind === 'source' && got.label === want.label && got.line === line && got.column === column;
  if (isText(want.text)) {
    textTotal++;
    if (hit) textExact++;
  }
  const rightExercise = got?.kind === 'source' && got.label === want.label;
  if (want.kind !== 'other') {
    buckets[want.kind].total++;
    if (rightExercise) buckets[want.kind].exercise++;
  }
  if (hit) exact++;
  else if (rightExercise && got.line === line) rightLine++;
  else if (rightExercise) otherLine++;
  else if (got?.kind !== 'source') template++;
  else wrongExercise++;
  if (!hit && misses.length < 40) {
    const gotText = got?.kind === 'source' ? `${got.label} ${got.line}:${got.column}` : (got?.kind ?? 'nothing');
    misses.push(`${want.text}[${k}] (${want.label} ${line}:${column}) -> ${gotText} probe=${JSON.stringify(probe)}`);
  }
}
const total = truth.size;
const pct = (k: number, of = total) => `${((100 * k) / Math.max(1, of)).toFixed(1)} %`;
const inExercise = exact + rightLine + otherLine;
const bucket = (b: { total: number; exercise: number }) => `${b.exercise}/${b.total} = ${pct(b.exercise, b.total)}`;
console.log(JSON.stringify({ sample: id, printedWords: n, sourceWords: m, aligned: total, runningText: `${textExact}/${textTotal} = ${pct(textExact, textTotal)}`, exact: pct(exact), rightLineOtherColumn: pct(rightLine), rightExercise: pct(inExercise), template: pct(template), wrongExercise, tikzLabels: bucket(buckets.tikz), mathLetters: bucket(buckets.math) }));
if (process.env.MISSES) for (const miss of misses) console.log(miss);
if (inExercise < 0.9 * total || wrongExercise > 0) process.exitCode = 1;
