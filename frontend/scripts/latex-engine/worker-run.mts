// Drives src/lib/latex/compiler.worker.ts under Node through its real message protocol (formats, sessions, aux seeds, xdvipdfmx).
// Usage: npx vite-node scripts/latex-engine/worker-run.mts <engine dir> <doc.tex> [edits.json]   (tree: TEXLIVE_ROOT, default /opt/texlive; RESOURCES: a dir whose files go in as teacher resources, e.g. examance-logo.pdf)
// Prints one JSON line per compile; each edit compiles in the same session, as the exercise editor would.
import fs from 'node:fs';
import path from 'node:path';

const [engineDir, docPath, editsPath] = process.argv.slice(2);
if (!engineDir || !docPath) throw new Error('usage: worker-run.mts <engine dir> <doc.tex> [edits.json]');
const root = process.env.TEXLIVE_ROOT ?? '/opt/texlive';
const examanceCnf = path.resolve('../backend/latex-texlive/texmf.cnf');
const SKIPPED = ['texmf-dist/doc/', 'texmf-dist/source/', 'texmf-dist/scripts/'];

function manifest() {
  const files: Record<string, number> = { 'examance/texmf.cnf': fs.statSync(examanceCnf).size };
  if (fs.existsSync(path.join(root, 'texmf.cnf'))) files['texmf.cnf'] = fs.statSync(path.join(root, 'texmf.cnf')).size;
  for (const top of ['texmf-dist', 'texmf-var']) {
    for (const rel of fs.readdirSync(path.join(root, top), { recursive: true }) as string[]) {
      const name = `${top}/${rel}`;
      const st = fs.statSync(path.join(root, name));
      if (st.isFile() && !SKIPPED.some((s) => name.startsWith(s))) files[name] = st.size;
    }
  }
  return { version: 'local', files };
}

// The worker's view of the world: `self` with postMessage back to this "main thread", and fetch of /core/latex-engine/ from the engine dir.
const listeners: ((data: any) => void)[] = [];
let workerOnMessage: ((e: { data: unknown }) => void) | null = null;
const fakeSelf = {
  postMessage: (data: any) => listeners.forEach((l) => l(data)),
  set onmessage(fn: (e: { data: unknown }) => void) {
    workerOnMessage = fn;
  },
};
(globalThis as any).self = fakeSelf;
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: string) => {
  const m = /^\/core\/latex-engine\/(.+)\.gz$/.exec(String(url));
  if (m) return new Response(fs.readFileSync(path.join(engineDir, m[1])));
  return realFetch(url);
};
const send = (data: unknown) => workerOnMessage!({ data });

const tree = manifest();
listeners.push((m) => {
  if (m?.type !== 'tree-request') return;
  if (m.kind === 'manifest') send({ type: 'tree-reply', reqId: m.reqId, value: tree });
  else {
    const file = m.path === 'examance/texmf.cnf' ? examanceCnf : path.join(root, m.path);
    send({ type: 'tree-reply', reqId: m.reqId, value: new Uint8Array(fs.readFileSync(file)) });
  }
});

await import('../../src/lib/latex/compiler.worker');

const assetsDir = path.resolve('../backend/latex-assets');
const assets = (fs.readdirSync(assetsDir, { recursive: true }) as string[])
  .filter((rel) => fs.statSync(path.join(assetsDir, rel)).isFile())
  .map((rel) => ({ path: rel, content: new Uint8Array(fs.readFileSync(path.join(assetsDir, rel))) }));
send({ type: 'assets', files: assets });

const resourceDir = process.env.RESOURCES;
const resources = resourceDir
  ? fs.readdirSync(resourceDir).map((filename) => ({ filename, content: new Uint8Array(fs.readFileSync(path.join(resourceDir, filename))) }))
  : [];

let nextId = 0;
function compile(latexSource: string, seedAux: unknown[] = []): Promise<any> {
  const id = ++nextId;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const l = (m: any) => {
      if (m?.id !== id || m.status) return;
      listeners.splice(listeners.indexOf(l), 1);
      resolve({ ...m, ms: performance.now() - t0 });
    };
    listeners.push(l);
    send({ id, latexSource, resources, seedAux, session: 'exercise:doc:angabe' });
  });
}

const summary = (label: string, r: any) =>
  console.log(JSON.stringify({ label, ms: Math.round(r.ms), success: r.success, pdf: r.pdfBytes?.length ?? 0, aux: (r.aux ?? []).map((a: any) => a.path), t: r.timings && { format: r.timings.format, formatMs: Math.round(r.timings.formatMs), passes: r.timings.passes.map((p: any) => `${Math.round(p.ms)}@${p.from}`), pdfMs: Math.round(r.timings.pdfMs), cps: r.timings.checkpoints, mode: r.timings.mode, MB: r.timings.checkpointMB }, error: r.success ? undefined : String(r.error).slice(0, 400) }));

const doc = fs.readFileSync(docPath, 'utf8');
const first = await compile(doc);
summary('first (dumps the format)', first);
summary('same document again', await compile(doc));
// Each edit is made against the base text, and the base is compiled again afterwards (not measured), as in node-run.mts.
for (const edit of editsPath ? (JSON.parse(fs.readFileSync(editsPath, 'utf8')) as { label: string; tex: string }[]) : []) {
  summary(edit.label, await compile(edit.tex));
  await compile(doc);
}
process.exit(0);
