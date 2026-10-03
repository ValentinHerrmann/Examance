<script lang="ts">
  import type { Snippet } from "svelte";
  import { tick } from "svelte";

  /**
   * Anchored panel: `trigger` snippet + children. Fixed-positioned from the trigger rect and clamped to
   * the viewport, so no scroll container clips it. Outside click and Escape close; focus returns to the trigger.
   */
  interface Props {
    open?: boolean;
    placement?: "bottom-start" | "bottom-end" | "top-start";
    onClose?: (() => void) | undefined;
    panelClass?: string;
    trigger?: Snippet;
    children?: Snippet;
  }

  let {
    open = $bindable(false),
    placement = "bottom-start",
    onClose = undefined,
    panelClass = "",
    trigger,
    children,
  }: Props = $props();

  let root: HTMLElement | undefined = $state();
  let panel: HTMLElement | undefined = $state();
  let pos = $state({ top: 0, left: 0 });
  const MARGIN = 8;

  function close() {
    if (!open) return;
    open = false;
    onClose?.();
    (root?.querySelector("[data-popover-trigger] :is(button, a, [tabindex])") as HTMLElement | null)?.focus();
  }

  function reposition() {
    if (!root || !panel) return;
    const t = root.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = placement === "top-start" ? t.top - p.height - 4 : t.bottom + 4;
    let left = placement === "bottom-end" ? t.right - p.width : t.left;
    left = Math.max(MARGIN, Math.min(left, vw - p.width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - p.height - MARGIN));
    pos = { top, left };
  }

  function onPointerDown(event: PointerEvent) {
    if (open && !root?.contains(event.target as Node) && !panel?.contains(event.target as Node)) {
      open = false;
      onClose?.();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  $effect.pre(() => {
    const isOpen = open;
    if (typeof window === "undefined") return;
    if (isOpen) void tick().then(reposition);
  });
</script>

<svelte:window
  onpointerdown={onPointerDown}
  onkeydown={onKeydown}
  onresize={() => open && reposition()}
  onscrollcapture={() => open && reposition()}
/>

<span bind:this={root} class="inline-flex" data-popover-trigger>
  {@render trigger?.()}
</span>

{#if open}
  <div
    bind:this={panel}
    class="fixed rounded-md border border-line bg-surface-raised text-content shadow-md {panelClass}"
    style="z-index: var(--z-dropdown); top: {pos.top}px; left: {pos.left}px; max-width: calc(100vw - 1rem)"
  >
    {@render children?.()}
  </div>
{/if}
