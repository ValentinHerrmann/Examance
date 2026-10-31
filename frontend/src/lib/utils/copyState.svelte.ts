/** "Copy" button state: `copied` for a moment after success, `failed` when the clipboard is refused. Call during component init; the reset timer is cleared on unmount. */
export function createCopyState(resetMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state = $state({ copied: false, failed: false });

  $effect(() => () => clearTimeout(timer));

  return {
    get copied() {
      return state.copied;
    },
    get failed() {
      return state.failed;
    },
    async copy(text: string): Promise<void> {
      state.failed = false;
      try {
        await navigator.clipboard.writeText(text);
        state.copied = true;
        clearTimeout(timer);
        timer = setTimeout(() => (state.copied = false), resetMs);
      } catch {
        state.failed = true;
      }
    },
  };
}
