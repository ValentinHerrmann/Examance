// Drawn pages against the real PDF (issue #352): compiles every sample with the engine, draws each page from the XDV (lib/latex/engine/xdvRender) and
// renders the PDF xdvipdfmx makes of the same XDV with pdf.js, both at 2 px per bp, and compares them pixel by pixel.
// Usage: npm run latex:render-compare   (tree: TEXLIVE_ROOT; ENGINE: an unpacked engine dir instead of the committed one; OUT=<dir> writes drawn|pdf|diff PNGs).
// Fails when a page that must be drawn falls back, or a drawn page misses ink the PDF has or differs on average by more than the threshold.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, Path2D, type SKRSContext2D } from '@napi-rs/canvas';
import { TexEngine } from '../../src/lib/latex/engine/engine';
import { LazyTree } from '../../src/lib/latex/engine/tree';
import type { DrawContext } from '../../src/lib/latex/engine/xdvRender/content';
import type { PathLike } from '../../src/lib/latex/engine/xdvRender/fonts';
import { PageRenderer, type CanvasHost } from '../../src/lib/latex/engine/xdvRender/renderer';
import { extractSourceMap } from '#lib/latex/sourceMap';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { unpackEngine } from './localEngine.mts';
import { assetInputs, localSource } from './localTree.mts';
import { SAMPLES } from './samples';

/** Samples whose pages must all be drawn (the TikZ ones included); the rest report what falls back. */
const MUST_DRAW = ['exam', 'exam-solution', 'exercise-Stromkreis', 'exercise-Klassendiagramm', 'exercise-Struktogramm'];
const SCALE = 2;
/** Mean absolute grey difference (0-255) a drawn page may have; anti-aliasing alone stays far below. */
const MAX_MEAN = 1.5;
/** Share of the PDF's ink pixels the drawn page may lack (a missing glyph or rule shows here). */
const MAX_MISSING = 0.002;

const engineDir = process.env.ENGINE ?? unpackEngine(fs.mkdtempSync(path.join(os.tmpdir(), 'examance-engine-')));
const out = process.env.OUT;
if (out) fs.mkdirSync(out, { recursive: true });
const tree = await LazyTree.open(localSource(), false);
const xetex = await WebAssembly.compile(fs.readFileSync(path.join(engineDir, 'xetex.wasm')));
const xdvipdfmx = await WebAssembly.compile(fs.readFileSync(path.join(engineDir, 'xdvipdfmx.wasm')));
const icuData = new Uint8Array(fs.readFileSync(path.join(engineDir, 'icudt78l.dat')));
const fontEngine = new TexEngine({ module: xetex, tree, icuData, format: null, incremental: false });
const host: CanvasHost<SKRSContext2D> = {
  create(width, height) {
    const ctx = createCanvas(width, height).getContext('2d');
    return { ctx: ctx as unknown as DrawContext, finish: () => ctx };
  },
  path: () => new Path2D() as unknown as PathLike,
};
const renderer = new PageRenderer(tree, (p, i, g, n) => fontEngine.glyphOutline(p, i, g, n), host);
const pdfjs = await loadPdfjs();
pdfjs.GlobalWorkerOptions.workerSrc = path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');

async function compile(tex: string): Promise<{ xdv: Uint8Array; pdf: Uint8Array }> {
  const e = new TexEngine({ module: xetex, tree, icuData, format: 'xelatex', incremental: false });
  for (const [rel, bytes] of assetInputs()) e.inputs.set(rel, bytes);
  e.setInput('main.tex', new TextEncoder().encode(tex));
  const args = ['/opt/texlive/bin/x86_64-linux/xelatex', '-no-pdf', '-interaction=nonstopmode', '-fmt=xelatex', 'main.tex'];
  let r = await e.runFull(args);
  // Second pass for references, as the app's compile does.
  if (r.outputs.has('/work/main.aux')) {
    e.setInput('main.aux', r.outputs.get('/work/main.aux')!);
    r = await e.runFull(args);
  }
  const xdv = r.outputs.get('/work/main.xdv');
  if (!xdv) throw new Error(r.stdout.slice(-2000));
  const p = new TexEngine({ module: xdvipdfmx, tree, icuData, format: null, incremental: false });
  p.inputs.set('main.xdv', xdv);
  const pr = await p.runFull(['/opt/texlive/bin/x86_64-linux/xdvipdfmx', '-q', '-E', '-o', 'main.pdf', 'main.xdv']);
  const pdf = pr.outputs.get('/work/main.pdf');
  if (!pdf) throw new Error(pr.stdout.slice(-2000));
  return { xdv, pdf };
}

function grey(ctx: SKRSContext2D, w: number, h: number): Uint8Array {
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  return g;
}

let failed = false;
for (const sample of SAMPLES) {
  const { xdv, pdf } = await compile(extractSourceMap(sample.build(sample.exercises)).tex); // NOSONAR: samples compile one after another on one tree
  const doc = await pdfjs.getDocument({ data: pdf.slice(), disableFontFace: true, useSystemFonts: false }).promise; // NOSONAR: as above
  const parsed = await renderer.parse(xdv); // NOSONAR: as above
  const report: string[] = [];
  for (const page of parsed.pages) {
    const drawn = await renderer.render(xdv, page.number, SCALE); // NOSONAR: pages draw one after another
    if (!drawn.drawable) {
      report.push(`p${page.number} falls back (${drawn.reason})`);
      if (MUST_DRAW.includes(sample.id)) failed = true;
      continue;
    }
    const pdfPage = await doc.getPage(page.number); // NOSONAR: as above
    const viewport = pdfPage.getViewport({ scale: SCALE });
    const w = Math.ceil(drawn.size.width * SCALE), h = Math.ceil(drawn.size.height * SCALE);
    const canvas = createCanvas(w, h);
    const ref = canvas.getContext('2d');
    ref.fillStyle = '#fff';
    ref.fillRect(0, 0, w, h);
    await pdfPage.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ref as unknown as CanvasRenderingContext2D, viewport }).promise; // NOSONAR: as above
    const a = grey(drawn.image, w, h), b = grey(ref, w, h);
    let sum = 0, ink = 0, missing = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i]);
      if (b[i] < 128) {
        ink++;
        if (a[i] > 200) missing++;
      }
    }
    const mean = sum / a.length, miss = missing / Math.max(1, ink);
    const ok = mean <= MAX_MEAN && miss <= MAX_MISSING;
    if (!ok) failed = true;
    report.push(`p${page.number} mean ${mean.toFixed(2)} missing ${(100 * miss).toFixed(2)} %${ok ? '' : ' FAIL'}`);
    if (out) {
      const side = createCanvas(w * 3, h);
      const sc = side.getContext('2d');
      sc.drawImage(drawn.image.canvas, 0, 0);
      sc.drawImage(canvas, w, 0);
      const diff = sc.createImageData(w, h);
      for (let i = 0; i < a.length; i++) {
        const d = Math.min(255, Math.abs(a[i] - b[i]) * 4);
        diff.data.set([255, 255 - d, 255 - d, 255], i * 4);
      }
      sc.putImageData(diff, 2 * w, 0);
      fs.writeFileSync(path.join(out, `${sample.id}-p${page.number}.png`), side.toBuffer('image/png'));
    }
  }
  console.log(`${sample.id}: ${report.join('; ')}`);
}
if (failed) process.exitCode = 1;
