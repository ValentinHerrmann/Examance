<script lang="ts">
  import { onDestroy } from "svelte";

  /**
   * The single dialog shell. Every overlay in the app renders through this so
   * backdrop, z-index, scroll locking, Escape handling and the small-screen
   * full-sheet behaviour are decided once.
   *
   * On phones anything larger than `sm` becomes a full-height sheet — a centred
   * box with a max-width is not a usable shape at 360px.
   */
  export let open = false;
  export let size: "sm" | "md" | "lg" | "xl" | "full" = "md";
  export let title: string | undefined = undefined;
  export let labelledBy: string | undefined = undefined;
  export let closeOnBackdrop = true;
  export let closeOnEscape = true;
  export let onClose: (() => void) | undefined = undefined;
  /** Removes the default body padding for panes that manage their own (PDF, canvas). */
  export let bare = false;

  let panel: HTMLElement | undefined;

  const sizes: Record<string, string> = {
    sm: "sm:max-w-md",
    md: "sm:max-w-xl",
    lg: "sm:max-w-3xl",
    xl: "sm:max-w-6xl",
    full: "sm:max-w-none",
  };

  /* Phone: full-bleed sheet. `sm` and up: centred card capped by `sizes`. */
  const shape =
    "flex h-dvh w-full flex-col overflow-hidden border-line bg-surface-raised text-content " +
    "sm:h-auto sm:max-h-[90dvh] sm:rounded-xl sm:border";

  function requestClose() {
    onClose?.();
  }

  function onBackdropClick(event: MouseEvent) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      requestClose();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (!open) {
      return;
    }
    if (closeOnEscape && event.key === "Escape") {
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== "Tab" || !panel) {
      return;
    }

    // Keep focus inside the dialog.
    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Lock background scrolling while a dialog is up, so the page underneath does
  // not scroll away on touch devices.
  let locked = false;
  $: if (typeof document !== "undefined") {
    if (open && !locked) {
      document.body.style.overflow = "hidden";
      locked = true;
    } else if (!open && locked) {
      document.body.style.overflow = "";
      locked = false;
    }
  }

  onDestroy(() => {
    if (locked && typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  });
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 flex items-stretch justify-center overscroll-contain bg-slate-900/85 backdrop-blur-sm sm:items-center sm:p-4"
    style="z-index: var(--z-modal)"
    on:click={onBackdropClick}
  >
    <div
      bind:this={panel}
      class="{shape} {sizes[size]} {size === 'full' ? 'sm:w-full' : ''}"
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy ? undefined : title}
      aria-labelledby={labelledBy}
    >
      {#if $$slots.header || title}
        <header
          class="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5"
        >
          <slot name="header">
            <h2 class="m-0 min-w-0 truncate text-base font-semibold text-accent sm:text-lg">
              {title}
            </h2>
          </slot>
          {#if onClose}
            <button
              type="button"
              class="shrink-0 cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-xl leading-none text-muted hover:bg-surface-inset hover:text-content"
              aria-label="Close"
              on:click={requestClose}
            >
              ×
            </button>
          {/if}
        </header>
      {/if}

      <div
        class="scroll-pane min-h-0 flex-1 overflow-y-auto overscroll-contain {bare
          ? ''
          : 'px-4 py-4 sm:px-5'}"
      >
        <slot />
      </div>

      {#if $$slots.footer}
        <footer
          class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5"
        >
          <slot name="footer" />
        </footer>
      {/if}
    </div>
  </div>
{/if}
