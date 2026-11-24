/// <reference lib="webworker" />
/** TeXpresso spike: XDV to PDF with busytex's own xdvipdfmx applet (classic worker: busytex_pipeline.js needs importScripts). */
// No ES imports: Vite serves workers as modules in dev, and a classic worker must stay a plain script there.
declare const BusytexPipeline: any;

try {
  // Builds join busytex's gzipped chunks with the interceptor process-large-files.mjs places next to the packages; dev serves raw files.
  importScripts('/core/busytex/fetch-interceptor.js');
} catch {}

const BASE = '/core/busytex';
const PACKAGES = ['texlive-basic', 'texlive-recommended', 'texlive-extra'].map((p) => `${BASE}/${p}.js`);
const DIR = '/home/web_user/project_dir';

let modulePromise: Promise<any> | null = null;
let header: Uint8Array | null = null;

function boot(): Promise<any> {
  if (!modulePromise) {
    importScripts(`${BASE}/busytex_pipeline.js`);
    const pipeline = new BusytexPipeline(`${BASE}/busytex.js`, `${BASE}/busytex.wasm`, PACKAGES, PACKAGES, [], () => {}, () => {}, true, BusytexPipeline.ScriptLoaderWorker);
    modulePromise = (pipeline.Module as Promise<any>).then((Module) => {
      Module.FS.mkdirTree?.(DIR);
      Module.FS.chdir(DIR);
      // busytex resets the heap to this header after every applet call, so the next call starts clean.
      header = Uint8Array.from(Module.HEAPU8.slice(0, pipeline.mem_header_size));
      return Module;
    });
  }
  return modulePromise;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, xdv } = e.data as { id: number; xdv?: Uint8Array };
  try {
    const t0 = performance.now();
    const Module = await boot();
    if (!xdv) {
      self.postMessage({ id, ready: true, ms: performance.now() - t0 });
      return;
    }
    const t1 = performance.now();
    Module.FS.writeFile(`${DIR}/main.xdv`, xdv);
    const { exit_code, stdout, stderr } = Module.callMainWithRedirects(['xdvipdfmx', '-o', 'main.pdf', 'main.xdv'], false);
    Module.HEAPU8.fill(0);
    Module.HEAPU8.set(header!);
    const pdf: Uint8Array | null = Module.FS.analyzePath(`${DIR}/main.pdf`).exists ? Module.FS.readFile(`${DIR}/main.pdf`) : null;
    try {
      Module.FS.unlink(`${DIR}/main.pdf`);
    } catch {}
    self.postMessage({ id, pdf, exitCode: exit_code, log: `${stdout}\n${stderr}`, ms: performance.now() - t1 }, pdf ? [pdf.buffer] : []);
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
