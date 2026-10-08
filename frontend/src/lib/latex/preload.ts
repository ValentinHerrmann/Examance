/**
 * Warms the local LaTeX engine once the app is idle. The compiler is imported lazily so its worker
 * asset stays out of the root-layout chunk (same reason as `clearCompileCache` in db/hygiene.ts).
 */
export function preloadLocalLatexEngine(): void {
  if (typeof window === 'undefined') return;

  const run = () => {
    import('./compiler')
      .then((compiler) => compiler.preloadLocalEngine())
      .catch((err) => console.warn('[compiler] Could not load the local LaTeX engine:', err));
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 1500);
  }
}
