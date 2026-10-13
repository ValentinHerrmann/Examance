/**
 * Starts the local LaTeX engine download in the background as soon as local compilation is chosen. The compiler is
 * imported lazily so its worker asset stays out of the root-layout chunk (same reason as `clearCompileCache` in
 * db/hygiene.ts).
 */
export function preloadLocalLatexEngine(): void {
  if (typeof window === 'undefined') return;

  import('./compiler')
    .then((compiler) => compiler.preloadLocalEngine())
    .catch((err) => console.warn('[compiler] Could not load the local LaTeX engine:', err));
}
