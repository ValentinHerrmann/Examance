// The committed browser engine (static/core/latex-engine/*.gz) unpacked into a directory, as node-run.mts and worker-run.mts read it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** Writes xetex.wasm, xdvipdfmx.wasm and icudt78l.dat into `dir` and returns it. */
export function unpackEngine(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['xetex.wasm', 'xdvipdfmx.wasm', 'icudt78l.dat']) {
    fs.writeFileSync(path.join(dir, name), zlib.gunzipSync(fs.readFileSync(path.resolve('static/core/latex-engine', `${name}.gz`))));
  }
  return dir;
}
