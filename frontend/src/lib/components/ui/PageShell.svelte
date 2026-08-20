<script lang="ts">
  /**
   * The one page root. Replaces the per-route wrappers that each re-declared
   * their own padding + width + box-sizing, and gives every page the same
   * responsive gutters and content cap.
   */
  export let width: "form" | "narrow" | "wide" | "full" = "wide";

  /** Drops the vertical padding for pages that fill the viewport themselves. */
  export let flush = false;

  const widths: Record<string, string> = {
    form: "max-w-form",
    narrow: "max-w-narrow",
    wide: "max-w-wide",
    full: "max-w-page",
  };

  let className = "";
  export { className as class };
</script>

<div
  class="mx-auto box-border w-full min-w-0 px-4 sm:px-5 lg:px-6 {flush
    ? ''
    : 'py-4 lg:py-6'} {widths[width]} {className}"
>
  <slot />
</div>
