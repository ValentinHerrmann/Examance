// TeXpresso spike: runs src/lib/latex/texpresso-spike/engine.ts under Node for repeatable engine timings (no browser, no xdvipdfmx).
// Usage: node scripts/texpresso-spike/node-run.mts <engine out dir> <doc.tex> [edits.json]   (busytex assets in static/core/busytex)
// edits.json: [{ "label": "...", "tex": "<full edited document>" }]; prints one JSON line per measurement.
import fs from 'node:fs';
import path from 'node:path';
import { TexpressoEngine } from '../../src/lib/latex/texpresso-spike/engine.ts';
import { parsePackageScript, TexTree, TREE_PACKAGES } from '../../src/lib/latex/texpresso-spike/texTree.ts';

const [outDir, docPath, editsPath] = process.argv.slice(2);
if (!outDir || !docPath) throw new Error('usage: node-run.mts <engine out dir> <doc.tex> [edits.json]');
const busytex = path.resolve('static/core/busytex');
const assetsDir = path.resolve('../backend/latex-assets');

const tree = new TexTree();
for (const name of TREE_PACKAGES) {
  const { files, table } = parsePackageScript(fs.readFileSync(path.join(busytex, `${name}.js`), 'utf8'));
  const data = new Uint8Array(fs.readFileSync(path.join(busytex, `${name}.data`)));
  tree.bytes += data.byteLength;
  tree.addPackage({ data, ...table }, files);
}
const module = await WebAssembly.compile(fs.readFileSync(path.join(outDir, 'xetex.wasm')));
const icuData = new Uint8Array(fs.readFileSync(path.join(outDir, 'icudt78l.dat')));
const log = (o: object) => console.log(JSON.stringify(o));

let format = process.env.FORMAT ?? '/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt';
const args = () => ['/bin/xelatex', '-no-pdf', '-synctex=-1', '-interaction=nonstopmode', `-fmt=${format}`, 'main.tex'];
const make = (fmt: string | null) => new TexpressoEngine({ module, tree, icuData, format: fmt, checkpointEveryMs: Number(process.env.CHECKPOINT_MS ?? 150) });

function withAssets(e: TexpressoEngine): TexpressoEngine {
  for (const rel of fs.readdirSync(assetsDir, { recursive: true }) as string[]) {
    const abs = path.join(assetsDir, rel);
    if (!fs.statSync(abs).isFile()) continue;
    const bytes = new Uint8Array(fs.readFileSync(abs));
    e.inputs.set(rel, bytes);
    if (rel.startsWith('sty/') && /\.(sty|tex)$/.test(rel)) e.inputs.set(rel.slice(4), bytes);
  }
  return e;
}

if (process.env.DUMP_FORMAT) {
  const t0 = performance.now();
  const r = make(null).runFull(['/bin/xetex', '-ini', '-etex', '-jobname=xelatex', '-progname=xelatex', 'xelatex.ini']);
  const fmt = r.outputs.get('/work/xelatex.fmt');
  log({ step: 'dump-format', ms: performance.now() - t0, bytes: fmt?.length ?? 0, exit: r.exitCode, tail: fmt ? undefined : r.stdout.slice(-1500) });
  if (fmt) {
    tree.add('/fmt/xelatex.fmt', fmt);
    format = '/fmt/xelatex.fmt';
  }
}

const AUX = ['main.aux', 'main.toc', 'main.out'];
function typeset(e: TexpressoEngine, tex: string, fresh: boolean) {
  const t0 = performance.now();
  const at = e.setInput('main.tex', new TextEncoder().encode(tex));
  let r = fresh || at < 0 ? e.runFull(args()) : e.rerun(at);
  const passes = [{ ms: r.ms, from: r.resumedFrom }];
  for (let i = 1; i < 4; i++) {
    let inv = Infinity;
    for (const n of AUX) {
      const out = r.outputs.get(`/work/${n}`);
      const prev = e.inputs.get(n);
      if (!out || (prev && Buffer.compare(prev, out) === 0)) continue;
      const k = e.setInput(n, out);
      if (process.env.DEBUG_AUX) {
        const d = prev ? prev.findIndex((v, idx) => v !== out[idx]) : -1;
        console.error(`aux ${n}: ${prev?.length ?? 'new'} -> ${out.length}, first diff ${d}, invalidates trace ${k}`, prev && d >= 0 ? JSON.stringify(new TextDecoder().decode(out.subarray(Math.max(0, d - 60), d + 80))) : '');
      }
      inv = Math.min(inv, k < 0 ? (prev ? Infinity : 0) : k);
    }
    if (inv === Infinity) break;
    r = e.rerun(inv);
    passes.push({ ms: r.ms, from: r.resumedFrom });
  }
  return { r, passes, ms: performance.now() - t0 };
}

const doc = fs.readFileSync(docPath, 'utf8');
const engine = withAssets(make(format));
const first = typeset(engine, doc, true);
const xdv = first.r.outputs.get('/work/main.xdv');
log({ step: 'first', ms: first.ms, passes: first.passes, exit: first.r.exitCode, xdv: xdv?.length ?? 0, ...engine.stats(), missing: engine.importsMissing, tail: xdv ? undefined : first.r.stdout.slice(-3000) });
if (process.env.KEEP) {
  for (const [p, b] of first.r.outputs) fs.writeFileSync(path.join(process.env.KEEP, path.basename(p)), b);
}

const edits: { label: string; tex: string }[] = editsPath ? JSON.parse(fs.readFileSync(editsPath, 'utf8')) : [];
for (const edit of edits) {
  const inc = typeset(engine, edit.tex, false);
  const stats = engine.stats();
  const fresh = typeset(withAssets(make(format)), edit.tex, true);
  const a = inc.r.outputs.get('/work/main.xdv');
  const b = fresh.r.outputs.get('/work/main.xdv');
  log({ step: 'edit', label: edit.label, ms: inc.ms, passes: inc.passes, fullMs: fresh.ms, fullPasses: fresh.passes.length, identical: !!a && !!b && Buffer.compare(a, b) === 0, ...stats });
  typeset(engine, doc, false);
}
