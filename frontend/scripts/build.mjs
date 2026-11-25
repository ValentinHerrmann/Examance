// `npm run build`: the Vite build, then a check that every file fits Cloudflare Pages' 25 MiB per-file limit (the LaTeX engine's gzipped files are the largest, ~9 MB).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))));
  });
}

/** Files over the limit fail the build here rather than the Pages upload later. */
function oversized(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return oversized(full);
    return entry.isFile() && fs.statSync(full).size > MAX_FILE_BYTES ? [full] : [];
  });
}

try {
  await run('npx', ['--no-install', 'vite', 'build']);
  const tooBig = oversized(path.resolve('build'));
  if (tooBig.length > 0) throw new Error(`Files over Cloudflare Pages' 25 MiB limit: ${tooBig.join(', ')}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
