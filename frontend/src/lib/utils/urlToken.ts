/**
 * Reads the single-use `?token=` of a mailed link and removes it from the address bar and history.
 * Native `history` on purpose: SvelteKit's `replaceState` rejects in `onMount` before the router started.
 */
export function takeUrlToken(): string {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token') ?? '';
  if (token) {
    url.searchParams.delete('token');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  return token;
}
