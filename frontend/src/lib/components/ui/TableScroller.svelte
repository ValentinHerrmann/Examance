<script lang="ts">
  /**
   * Wraps a wide table so it scrolls inside its own box instead of pushing the
   * page sideways. Tables that lacked this were clipped outright by the app
   * shell and became unreachable.
   */
  export let label: string | undefined = undefined;

  let className = "";
  export { className as class };
</script>

<div
  class="scroll-pane w-full min-w-0 overflow-x-auto overscroll-x-contain {className}"
  role="region"
  aria-label={label}
  tabindex="0"
>
  <slot />
</div>
