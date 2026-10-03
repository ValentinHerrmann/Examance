<script lang="ts">
  import type { Snippet } from "svelte";
  import { tick } from "svelte";

  /**
   * Short text tip (Artemis spec), shown on hover and keyboard focus, never hover-only. `position: fixed`
   * so clipped/scrolling ancestors cannot cut it off. Not an accessible name: the control keeps its own `aria-label`.
   */
  interface Props {
    text: string;
    placement?: "top" | "bottom" | "right" | "left";
    disabled?: boolean;
    /** Classes for the wrapper around the trigger, e.g. `flex w-full` for nav rows. */
    wrapperClass?: string;
    children?: Snippet;
  }

  let {
    text,
    placement = "top",
    disabled = false,
    wrapperClass = "inline-flex min-w-0",
    children,
  }: Props = $props();

  let anchor: HTMLElement | undefined = $state();
  let tip: HTMLElement | undefined = $state();
  let visible = $state(false);
  let style = $state("");

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  bind:this={anchor}
  class={wrapperClass}
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
  onkeydown={(event) => event.key === "Escape" && hide()}
>
  {@render children?.()}
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
