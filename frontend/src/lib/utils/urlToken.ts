/**
 * Reads a one-shot query parameter and removes it from the address bar and history.
 * Native `history` on purpose: SvelteKit's `replaceState` rejects in `onMount` before the router started.
 */
export function takeUrlParam(name: string): string {
  const url = new URL(window.location.href);
  const value = url.searchParams.get(name) ?? '';
  if (value) {
    url.searchParams.delete(name);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  return value;
}

/** The single-use `?token=` of a mailed link. */
export const takeUrlToken = (): string => takeUrlParam('token');
