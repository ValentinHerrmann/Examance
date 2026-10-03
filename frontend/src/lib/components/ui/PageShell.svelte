<script lang="ts">
  /**
   * The one page root: same gutters and content cap on every page.
   * `fluid` has no cap (workspace pages).
   */
  export let width: "form" | "narrow" | "medium" | "wide" | "full" | "fluid" = "wide";

  /** Drops the vertical padding for pages that fill the viewport themselves. */
  export let flush = false;

  const widths: Record<string, string> = {
    form: "max-w-form",
    narrow: "max-w-narrow",
    medium: "max-w-medium",
    wide: "max-w-wide",
    full: "max-w-page",
    fluid: "max-w-none",
  };

  let className = "";
  export { className as class };
</script>

<div class="mx-auto w-full min-w-0 px-4 sm:px-6 {flush ? '' : 'py-4 sm:py-6'} {widths[width]} {className}">
  <slot />
</div>
