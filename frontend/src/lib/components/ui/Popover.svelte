<script lang="ts">
  import { tick } from "svelte";

  /**
   * Anchored panel: `trigger` slot + default slot content. Fixed-positioned
   * from the trigger rect and clamped to the viewport, so no scroll container
   * clips it. Outside click and Escape close; focus returns to the trigger.
   */
  export let open = false;
  export let placement: "bottom-start" | "bottom-end" | "top-start" = "bottom-start";
  export let onClose: (() => void) | undefined = undefined;
  export let panelClass = "";

  let root: HTMLElement;
  let panel: HTMLElement | undefined;
  let pos = { top: 0, left: 0 };
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

  $: if (typeof window !== "undefined") {
    if (open) void tick().then(reposition);
  }

  function onPointerDown(event: PointerEvent) {
    if (open && !root.contains(event.target as Node) && !panel?.contains(event.target as Node)) {
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

</script>

<svelte:window
  on:pointerdown={onPointerDown}
  on:keydown={onKeydown}
  on:resize={() => open && reposition()}
  on:scroll|capture={() => open && reposition()}
/>

<span bind:this={root} class="inline-flex" data-popover-trigger>
  <slot name="trigger" />
</span>

{#if open}
  <div
    bind:this={panel}
    class="fixed rounded-md border border-line bg-surface-raised text-content shadow-md {panelClass}"
    style="z-index: var(--z-dropdown); top: {pos.top}px; left: {pos.left}px; max-width: calc(100vw - 1rem)"
  >
    <slot />
  </div>
{/if}
