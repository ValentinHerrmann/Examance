// Click-to-source accuracy run (issues #347, #350): compiles the 12-task exam, its solution and the TikZ samples with the committed engine, reads the exact word boxes and clicks every word (click-accuracy.mts).
// Usage: npm run latex:click-accuracy   (tree: TEXLIVE_ROOT, default /opt/texlive; PYTHON: an interpreter with pdfminer.six, default python3). Fails when a sample misses the bar.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractSourceMap } from '#lib/latex/sourceMap';
import { unpackEngine } from './localEngine.mts';
import { SAMPLES } from './samples';

const IDS = ['exam', 'exam-solution', 'exercise-Stromkreis', 'exercise-Klassendiagramm', 'exercise-Struktogramm'];
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'examance-accuracy-'));
const engineDir = unpackEngine(path.join(work, 'engine'));
const python = (process.env.PYTHON ?? 'python3').split(' ');
const viteNode = (script: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync('npx', ['--no-install', 'vite-node', `scripts/latex-engine/${script}`, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });

let failed = false;
try {
  for (const id of IDS) {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) throw new Error(`no sample ${id}`);
    const dir = path.join(work, id);
    fs.mkdirSync(dir);
    const tex = path.join(dir, 'doc.tex');
    fs.writeFileSync(tex, extractSourceMap(sample.build(sample.exercises)).tex);
    const compiled = viteNode('node-run.mts', [engineDir, tex], { KEEP: dir });
    if (!fs.existsSync(path.join(dir, 'main.pdf'))) {
      console.log(`${id}: no PDF\n${compiled.stdout.slice(-2000)}${compiled.stderr.slice(-2000)}`);
      failed = true;
      continue;
    }
    const words = spawnSync(python[0], [...python.slice(1), 'scripts/latex-engine/pdf-words.py', path.join(dir, 'main.pdf')], { encoding: 'utf8', maxBuffer: 64 * 2 ** 20 });
    if (words.status !== 0) throw new Error(`pdf-words.py: ${words.stderr.slice(-2000)}`);
    fs.writeFileSync(path.join(dir, 'words.json'), words.stdout);
    const run = viteNode('click-accuracy.mts', [id, dir, path.join(dir, 'words.json')], { COLUMNS: '1' });
    process.stdout.write(run.stdout || run.stderr.slice(-2000));
    if (run.status !== 0) failed = true;
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
