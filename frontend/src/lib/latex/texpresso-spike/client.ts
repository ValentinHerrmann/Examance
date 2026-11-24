/** Main-thread handle on spike.worker.ts (TeXpresso spike, dev and preview builds only). */
import type { BenchRow, CompileReply, SpikeRequest } from './spike.worker';

export type { BenchRow, CompileReply };

export interface InitInfo {
  downloadMs: number;
  compileWasmMs: number;
  formatMs: number;
  xdvBootMs: number;
  treeBytes: number;
  treeSources: Record<string, string>;
  log: string[];
  missingImports: string[];
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

/** Distributes Omit over the request union, so each variant keeps its own fields. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export class SpikeClient {
  private readonly worker = new Worker(new URL('./spike.worker.ts', import.meta.url), { type: 'module' });
  private seq = 0;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.error && !e.data.pdf && !e.data.synctex) p.reject(new Error(e.data.error));
      else p.resolve(e.data);
    };
  }

  private send<T>(msg: WithoutId<SpikeRequest>, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  async init(assets: { path: string; content: Uint8Array }[]): Promise<InitInfo> {
    return (await this.send<{ init: InitInfo }>({ type: 'init', assets })).init;
  }

  compile(tex: string, full = false): Promise<CompileReply> {
    return this.send<CompileReply>({ type: 'compile', tex, full });
  }

  async bench(base: string, edits: { label: string; tex: string }[]): Promise<BenchRow[]> {
    return (await this.send<{ bench: BenchRow[] }>({ type: 'bench', base, edits })).bench;
  }

  terminate(): void {
    this.worker.terminate();
  }
}
