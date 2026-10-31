/** "Dirty form -> confirm discard -> force close" for dialogs. `request` is the cancel/X/Escape action: it closes at once when clean, else raises `confirming` (bind it to the ConfirmDialog's `open`). `force` is the confirm action and every programmatic close (after a save); it must be the only place `onClose` runs. */
export function createDirtyClose(opts: { isDirty: () => boolean; onClose: () => void }) {
  let confirming = $state(false);

  function force() {
    confirming = false;
    opts.onClose();
  }

  function request() {
    if (opts.isDirty()) confirming = true;
    else force();
  }

  function cancel() {
    confirming = false;
  }

  return {
    get confirming() {
      return confirming;
    },
    request,
    force,
    cancel,
  };
}
