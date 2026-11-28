// Re-records src/lib/latex/engine/templateFiles.json (the TeX Live files the worker prefetches at boot) from scratch: the template-only samples of samples.ts (lazy subject packages stay out) through the real worker (worker-run.mts).
// Usage: npm run latex:record-tree   (tree: TEXLIVE_ROOT, default /opt/texlive). CI runs it and fails on a diff (.github/workflows/latex-browser.yml).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractSourceMap } from '#lib/latex/sourceMap';
import { unpackEngine } from './localEngine.mts';
import { TEMPLATE_SAMPLES } from './samples';

const listFile = path.resolve('src/lib/latex/engine/templateFiles.json');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'examance-record-'));
const engineDir = unpackEngine(path.join(work, 'engine'));

const original = fs.readFileSync(listFile);
const recorded = path.join(work, 'templateFiles.json');
// The worker prefetches the committed list at boot; an empty list keeps the prefetch out of the recording, so stale entries drop out.
fs.writeFileSync(listFile, '[]\n');
let failed = false;
try {
  for (const sample of TEMPLATE_SAMPLES) {
    const tex = path.join(work, `${sample.id}.tex`);
    fs.writeFileSync(tex, extractSourceMap(sample.build(sample.exercises)).tex);
    const run = spawnSync('npx', ['--no-install', 'vite-node', 'scripts/latex-engine/worker-run.mts', engineDir, tex], {
      env: { ...process.env, RECORD_TREE: recorded },
      encoding: 'utf8',
    });
    const first = run.stdout.split('\n').find((line) => line.startsWith('{'));
    console.log(`${sample.id}: ${first ?? run.stderr.slice(-2000)}`);
    if (run.status !== 0 || !first?.includes('"success":true')) failed = true;
  }
} finally {
  fs.writeFileSync(listFile, failed ? original : fs.readFileSync(recorded));
  fs.rmSync(work, { recursive: true, force: true });
}
if (failed) throw new Error('a sample did not compile; templateFiles.json left unchanged');
