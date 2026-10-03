// Worker URLs must be relative to this module so Vite can bundle them (it cannot resolve `#lib` there).
export const spawnQrWorker = (): Worker =>
  new Worker(new URL('./qrWorker.ts', import.meta.url), { type: 'module' });

export const spawnOmrWorker = (): Worker =>
  new Worker(new URL('./omrWorker.ts', import.meta.url), { type: 'module' });
