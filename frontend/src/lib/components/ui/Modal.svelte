<script module lang="ts">
  // Open dialogs, bottom to top. Only the top one reacts to Escape/Tab, so a nested confirm closes on its own.
  const stack: symbol[] = [];
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { onDestroy, tick, untrack } from "svelte";
  import { faXmark } from "@fortawesome/free-solid-svg-icons";
  import { t } from "$lib/i18n";
  import { lockScroll } from "$lib/utils/scrollLock";
  import Button from "./Button.svelte";

  /**
   * The single dialog shell (Artemis spec): backdrop, z-index, focus, scroll lock, Escape and the phone sheet are decided once.
   * Widths: small 32rem, medium 48rem, large 72rem, full 90dvw x 90dvh; below `sm` all but `small` become a full-height sheet.
   * The panel is a size container: use `@md:`/`@xl:` container variants inside, never viewport `sm:`/`lg:`.
   */
  type Size = "small" | "medium" | "large" | "full";

  interface Props {
    open?: boolean;
    size?: Size;
    title?: string | undefined;
    labelledBy?: string | undefined;
    /** Off by default (Artemis): a stray click must not discard form input. Read-only previews may opt in. */
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    onClose?: (() => void) | undefined;
    /** Removes the body padding for panes that manage their own (PDF, canvas). */
    bare?: boolean;
    /** Fixed 90dvh height, so `h-full` children (editors, viewers) can fill it. */
    tall?: boolean;
    role?: "dialog" | "alertdialog";
    header?: Snippet;
    children?: Snippet;
    footer?: Snippet;
  }

  let {
    open = false,
    size = "medium",
    title = undefined,
    labelledBy = undefined,
    closeOnBackdrop = false,
    closeOnEscape = true,
    onClose = undefined,
    bare = false,
    tall = false,
    role = "dialog",
    header,
    children,
    footer,
  }: Props = $props();

  const widths: Record<Size, string> = {
    small: "max-w-lg",
    medium: "sm:max-w-3xl",
    large: "sm:max-w-6xl",
    full: "sm:max-w-none sm:w-[90dvw] sm:h-[90dvh]",
  };

  const id = Symbol("modal");
  let panel: HTMLElement | undefined = $state();
  let returnFocus: HTMLElement | null = null;
  let release: (() => void) | null = null;
  let active = false;

  async function activate() {
    active = true;
    stack.push(id);
    returnFocus = document.activeElement as HTMLElement | null;
    release = lockScroll();
    await tick();
    // First field inside the body; the panel itself as a fallback so screen readers announce the dialog.
    const target =
      panel?.querySelector<HTMLElement>("[autofocus]") ??
      panel?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"]',
      ) ??
      panel;
    target?.focus({ preventScroll: true });
  }

  function deactivate() {
    active = false;
    const index = stack.lastIndexOf(id);
    if (index !== -1) stack.splice(index, 1);
    release?.();
    release = null;
    if (returnFocus && document.contains(returnFocus)) {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
  }

  onDestroy(() => {
    if (active) deactivate();
  });

  function isTop(): boolean {
    return stack[stack.length - 1] === id;
  }

  function requestClose() {
    onClose?.();
  }

  function onBackdropClick(event: MouseEvent) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      requestClose();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (!open || !isTop()) {
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
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  let isSheet = $derived(size !== "small");
  let panelShape = $derived(isSheet
    ? "h-dvh sm:h-auto sm:max-h-[90dvh] sm:rounded-xl sm:border sm:border-line sm:shadow-xl"
    : "max-h-[90dvh] rounded-xl border border-line shadow-xl");
  let overlayShape = $derived(isSheet ? "items-stretch sm:items-center sm:p-4" : "items-center p-4");

  $effect.pre(() => {
    const isOpen = open;
    if (typeof document === "undefined") return;
    untrack(() => {
      if (isOpen && !active) activate();
      else if (!isOpen && active) deactivate();
    });
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 flex justify-center overscroll-contain bg-backdrop {overlayShape}"
    style="z-index: var(--z-modal)"
    onclick={onBackdropClick}
  >
    <div
      bind:this={panel}
      class="@container flex w-full flex-col overflow-hidden bg-surface-raised text-content outline-none {panelShape} {widths[
        size
      ]} {tall ? 'sm:h-[90dvh]' : ''}"
      {role}
      aria-modal="true"
      aria-label={labelledBy ? undefined : title}
      aria-labelledby={labelledBy}
      tabindex="-1"
    >
      {#if header || title || onClose}
        <header
          class="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 {isSheet
            ? 'pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4'
            : 'pt-4'}"
        >
          <div class="min-w-0 flex-1">
            {#if header}{@render header()}{:else}
              {#if title}
                <h2 class="m-0 truncate text-xl font-semibold text-content">{title}</h2>
              {/if}
            {/if}
          </div>
          {#if onClose}
            <Button
              variant="text"
              severity="secondary"
              size="sm"
              iconOnly
              icon={faXmark}
              ariaLabel={$t("common.close")}
              onClick={requestClose}
            />
          {/if}
        </header>
      {/if}

      <div
        class="scroll-pane min-h-0 flex-1 overflow-y-auto overscroll-contain {bare
          ? ''
          : 'px-4 pb-4'} {!bare && !(header || title || onClose) ? 'pt-4' : ''}"
      >
        {@render children?.()}
      </div>

      {#if footer}
        <footer
          class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 pt-3 {isSheet
            ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3'
            : 'pb-3'}"
        >
          {@render footer?.()}
        </footer>
      {/if}
    </div>
  </div>
{/if}
