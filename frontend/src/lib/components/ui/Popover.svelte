<script lang="ts">
  import type { Snippet } from "svelte";
  import { tick } from "svelte";

  /** Anchored panel: `trigger` snippet (or `anchorPoint`) + children. Fixed-positioned from the trigger rect and clamped to the viewport, so no scroll container clips it. Outside click and Escape close; focus returns to the trigger. */
  interface Props {
    open?: boolean;
    /** `right-start`/`left-start` open beside the trigger (a vertical toolbar's flyout). */
    placement?: "bottom-start" | "bottom-end" | "top-start" | "right-start" | "left-start";
    onClose?: (() => void) | undefined;
    panelClass?: string;
    trigger?: Snippet;
    children?: Snippet;
    /** Anchors the panel at a screen point instead of the trigger (a click on a PDF, issue #347); scrolling then closes it. */
    anchorPoint?: { x: number; y: number } | null;
  }

  let {
    open = $bindable(false),
    placement = "bottom-start",
    onClose = undefined,
    panelClass = "",
    trigger,
    children,
    anchorPoint = null,
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

  function reposition(point = anchorPoint) {
    if (!root || !panel) return;
    const t = point ? new DOMRect(point.x, point.y, 0, 0) : root.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = placement === "top-start" ? t.top - p.height - 4 : t.bottom + 4;
    if (placement === "right-start" || placement === "left-start") top = t.top;
    let left = placement === "bottom-end" ? t.right - p.width : t.left;
    if (placement === "right-start") left = t.right + 4;
    if (placement === "left-start") left = t.left - p.width - 4;
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

  function onScroll() {
    if (!open) return;
    if (!anchorPoint) return reposition();
    open = false;
    onClose?.();
  }

  $effect.pre(() => {
    const isOpen = open;
    const point = anchorPoint;
    if (typeof window === "undefined") return;
    if (isOpen) void tick().then(() => reposition(point));
  });
</script>

<svelte:window
  onpointerdown={onPointerDown}
  onkeydown={onKeydown}
  onresize={() => open && reposition()}
  onscrollcapture={onScroll}
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
