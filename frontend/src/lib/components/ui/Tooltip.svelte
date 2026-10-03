<script lang="ts">
  import { tick } from "svelte";

  /**
   * Short text tip for the wrapped element (Artemis tooltip spec). Shows on
   * hover and on keyboard focus — never hover-only, so touch and keyboard
   * users get it too. Rendered `position: fixed`, so a scrolling or clipped
   * ancestor (the sidebar rail, a table) cannot cut it off.
   *
   * Not a substitute for an accessible name: the wrapped control still needs
   * its own `aria-label`.
   */
  export let text: string;
  export let placement: "top" | "bottom" | "right" | "left" = "top";
  export let disabled = false;
  /** Classes for the wrapper around the trigger, e.g. `flex w-full` for nav rows. */
  export let wrapperClass = "inline-flex min-w-0";

  let anchor: HTMLElement;
  let tip: HTMLElement | undefined;
  let visible = false;
  let style = "";

  async function show() {
    if (disabled || !text) return;
    visible = true;
    await tick();
    position();
  }

  function hide() {
    visible = false;
  }

  function position() {
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    let top = 0;
    let left = 0;
    if (placement === "right") {
      top = a.top + a.height / 2 - t.height / 2;
      left = a.right + gap;
    } else if (placement === "left") {
      top = a.top + a.height / 2 - t.height / 2;
      left = a.left - t.width - gap;
    } else if (placement === "bottom") {
      top = a.bottom + gap;
      left = a.left + a.width / 2 - t.width / 2;
    } else {
      top = a.top - t.height - gap;
      left = a.left + a.width / 2 - t.width / 2;
    }
    // Clamp into the viewport.
    left = Math.max(gap, Math.min(left, window.innerWidth - t.width - gap));
    top = Math.max(gap, Math.min(top, window.innerHeight - t.height - gap));
    style = `top:${top}px;left:${left}px;z-index:var(--z-toast)`;
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<span
  bind:this={anchor}
  class={wrapperClass}
  on:mouseenter={show}
  on:mouseleave={hide}
  on:focusin={show}
  on:focusout={hide}
  on:keydown={(event) => event.key === "Escape" && hide()}
>
  <slot />
</span>

{#if visible}
  <span
    bind:this={tip}
    role="tooltip"
    class="pointer-events-none fixed max-w-[12.5rem] rounded-md bg-tooltip px-3 py-2 text-sm text-white shadow-md"
    {style}
  >
    {text}
  </span>
{/if}
