<script lang="ts">
  /**
   * Wraps a wide table so it scrolls inside its own box instead of pushing the
   * page sideways. Tables that lacked this were clipped outright by the app
   * shell and became unreachable.
   */
  export let label: string | undefined = undefined;
  /** Tailwind max-height class (e.g. "max-h-96"). Switches the box to vertical scrolling too, so `.data-table-sticky` headers stick. */
  export let maxHeight: string | undefined = undefined;

  let className = "";
  export { className as class };
</script>

<div
  class="scroll-pane w-full min-w-0 {maxHeight ? `overflow-auto ${maxHeight}` : "overflow-x-auto overflow-y-hidden overscroll-x-contain"} {className}"
  role="region"
  aria-label={label}
  tabindex="0"
>
  <slot />
</div>
