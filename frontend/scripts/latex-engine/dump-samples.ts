// Engine measurements: writes the sample documents (production builders, markers stripped) to <dir> for node-run.mts.
// Usage: npx vite-node scripts/latex-engine/dump-samples.ts <dir>   (dir inside frontend/)
import fs from 'node:fs';
import path from 'node:path';
import { frontendPathArg } from '../cli-path.mjs';
import { extractSourceMap } from '#lib/latex/sourceMap';
import { SAMPLES } from './samples';

if (!process.argv[2]) throw new Error('usage: dump-samples.ts <dir>');
const dir = frontendPathArg(2, '');
fs.mkdirSync(dir, { recursive: true });
for (const s of SAMPLES) fs.writeFileSync(path.join(dir, `${s.id}.tex`), extractSourceMap(s.build(s.exercises)).tex);
console.log(SAMPLES.map((s) => s.id).join('\n'));
