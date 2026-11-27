// Runs the browser LaTeX engine (src/lib/latex/engine/) under Node for repeatable timings and the replay check (docs/dev/latex_performance.md).
// Usage: npx vite-node scripts/latex-engine/node-run.mts <engine dir with xetex.wasm, xdvipdfmx.wasm, icudt78l.dat> <doc.tex> [edits.json]
// Reads the TeX Live tree from TEXLIVE_ROOT (default /opt/texlive, the backend image's) with the endpoint's filters (backend/app/services/texlive_tree.py).
// edits.json: [{ "label": "...", "tex": "<full edited document>" }]; prints one JSON line per measurement; KEEP=<dir> writes the outputs and main.pdf.
// RECORD_TREE=<json file> merges the tree files this run read into that list (src/lib/latex/engine/templateFiles.json is recorded so).
import fs from 'node:fs';
import path from 'node:path';
import { TexEngine, type RunResult } from '../../src/lib/latex/engine/engine';
import { compareCodeUnits } from '../../src/lib/utils/compare';
import { LazyTree, type TreeSource } from '../../src/lib/latex/engine/tree';

const [engineDir, docPath, editsPath] = process.argv.slice(2);
if (!engineDir || !docPath) throw new Error('usage: node-run.mts <engine dir> <doc.tex> [edits.json]');
const root = process.env.TEXLIVE_ROOT ?? '/opt/texlive';
const assetsDir = path.resolve('../backend/latex-assets');
const examanceCnf = path.resolve('../backend/latex-texlive/texmf.cnf');
const SKIPPED = ['texmf-dist/doc/', 'texmf-dist/source/', 'texmf-dist/scripts/'];

function localSource(): TreeSource {
  const files: Record<string, number> = {};
  if (fs.existsSync(path.join(root, 'texmf.cnf'))) files['texmf.cnf'] = fs.statSync(path.join(root, 'texmf.cnf')).size;
  for (const top of ['texmf-dist', 'texmf-var']) {
    for (const rel of fs.readdirSync(path.join(root, top), { recursive: true }) as string[]) {
      const name = `${top}/${rel}`;
      const st = fs.statSync(path.join(root, name));
      if (st.isFile() && !SKIPPED.some((s) => name.startsWith(s))) files[name] = st.size;
    }
  }
  files['examance/texmf.cnf'] = fs.statSync(examanceCnf).size;
  return {
    manifest: async () => ({ version: 'local', files }),
    file: async (rel) => new Uint8Array(fs.readFileSync(rel === 'examance/texmf.cnf' ? examanceCnf : path.join(root, rel))),
  };
}

const tree = await LazyTree.open(localSource(), false);
const xetex = await WebAssembly.compile(fs.readFileSync(path.join(engineDir, 'xetex.wasm')));
const xdvipdfmx = await WebAssembly.compile(fs.readFileSync(path.join(engineDir, 'xdvipdfmx.wasm')));
const icuData = new Uint8Array(fs.readFileSync(path.join(engineDir, 'icudt78l.dat')));
const log = (o: object) => console.log(JSON.stringify(o));

const format = process.env.FORMAT ?? 'xelatex';
const args = () => [`/opt/texlive/bin/x86_64-linux/xelatex`, '-no-pdf', '-synctex=-1', '-interaction=nonstopmode', `-fmt=${format}`, 'main.tex'];
const make = (incremental = true) =>
  new TexEngine({ module: xetex, tree, icuData, format, incremental, checkpointEveryMs: Number(process.env.CHECKPOINT_MS ?? 150), memoryBudget: Number(process.env.MEMORY_BUDGET ?? 900 * 2 ** 20) });

function withAssets(e: TexEngine): TexEngine {
  for (const rel of fs.readdirSync(assetsDir, { recursive: true }) as string[]) {
    const abs = path.join(assetsDir, rel);
    if (!fs.statSync(abs).isFile()) continue;
    const bytes = new Uint8Array(fs.readFileSync(abs));
    e.inputs.set(rel, bytes);
    if (rel.startsWith('sty/') && /\.(sty|tex)$/.test(rel)) e.inputs.set(rel.slice(4), bytes);
  }
  return e;
}

const AUX = ['main.aux', 'main.toc', 'main.out'];

/** Makes the changed aux files the next inputs; the earliest trace index they invalidate (0 for a new file), or Infinity when all settled. */
function feedAux(e: TexEngine, r: RunResult): number {
  let inv = Infinity;
  for (const n of AUX) {
    const out = r.outputs.get(`/work/${n}`);
    const prev = e.inputs.get(n);
    if (!out || (prev && Buffer.compare(prev, out) === 0)) continue;
    const k = e.setInput(n, out);
    if (k >= 0) inv = Math.min(inv, k);
    else if (!prev) inv = 0;
  }
  return inv;
}
async function typeset(e: TexEngine, tex: string, fresh: boolean) {
  const t0 = performance.now();
  const at = e.setInput('main.tex', new TextEncoder().encode(tex));
  let r = fresh || at < 0 ? await e.runFull(args()) : await e.rerun(at);
  const passes = [{ ms: r.ms, from: r.resumedFrom }];
  for (let i = 1; i < 4; i++) {
    const inv = feedAux(e, r);
    if (inv === Infinity) break;
    r = await e.rerun(inv); // NOSONAR: each pass reads the aux files of the one before
    passes.push({ ms: r.ms, from: r.resumedFrom });
  }
  return { r, passes, ms: performance.now() - t0 };
}

async function toPdf(xdv: Uint8Array) {
  const e = new TexEngine({ module: xdvipdfmx, tree, icuData, format: null, incremental: false });
  e.inputs.set('main.xdv', xdv);
  const t0 = performance.now();
  const r = await e.runFull([`/opt/texlive/bin/x86_64-linux/xdvipdfmx`, '-o', 'main.pdf', 'main.xdv']);
  return { pdf: r.outputs.get('/work/main.pdf'), ms: performance.now() - t0, exit: r.exitCode, stdout: r.stdout };
}

const doc = fs.readFileSync(docPath, 'utf8');
const engine = withAssets(make());
const first = await typeset(engine, doc, true);
const xdv = first.r.outputs.get('/work/main.xdv');
const pdf = xdv ? await toPdf(xdv) : null;
log({ step: 'first', ms: first.ms, passes: first.passes, exit: first.r.exitCode, xdv: xdv?.length ?? 0, pdf: pdf?.pdf?.length ?? 0, pdfMs: pdf?.ms, fetchedMB: tree.fetchedBytes / 2 ** 20, ...engine.stats(), missing: engine.importsMissing, tail: xdv ? undefined : first.r.stdout.slice(-3000), pdfTail: pdf?.pdf ? undefined : pdf?.stdout.slice(-2000) });
if (process.env.KEEP) {
  for (const [p, b] of first.r.outputs) fs.writeFileSync(path.join(process.env.KEEP, path.basename(p)), b);
  if (pdf?.pdf) fs.writeFileSync(path.join(process.env.KEEP, 'main.pdf'), pdf.pdf);
}

if (process.env.RECORD_TREE) {
  const file = process.env.RECORD_TREE;
  const before: string[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const now = tree.loadedPaths().map((p) => p.slice('/opt/texlive/'.length));
  fs.writeFileSync(file, `${JSON.stringify([...new Set([...before, ...now])].sort(compareCodeUnits), null, 1)}\n`);
}

const edits: { label: string; tex: string }[] = editsPath ? JSON.parse(fs.readFileSync(editsPath, 'utf8')) : [];
for (const edit of edits) {
  const inc = await typeset(engine, edit.tex, false); // NOSONAR: edits are measured one after another on one engine
  const stats = engine.stats();
  const fresh = await typeset(withAssets(make(false)), edit.tex, true); // NOSONAR: measured alone, not beside another run
  const a = inc.r.outputs.get('/work/main.xdv');
  const b = fresh.r.outputs.get('/work/main.xdv');
  log({ step: 'edit', label: edit.label, ms: inc.ms, passes: inc.passes, fullMs: fresh.ms, fullPasses: fresh.passes.length, identical: !!a && !!b && Buffer.compare(a, b) === 0, ...stats });
  await typeset(engine, doc, false); // NOSONAR: back to the base text before the next edit
}
