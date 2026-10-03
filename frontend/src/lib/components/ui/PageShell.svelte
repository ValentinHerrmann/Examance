<script lang="ts">
  import type { Snippet } from "svelte";

  const widths: Record<string, string> = {
    form: "max-w-form",
    narrow: "max-w-narrow",
    medium: "max-w-medium",
    wide: "max-w-wide",
    full: "max-w-page",
    fluid: "max-w-none",
  };

  /** The one page root: same gutters and content cap on every page; `fluid` has no cap (workspace pages). */
  interface Props {
    width?: "form" | "narrow" | "medium" | "wide" | "full" | "fluid";
    /** Drops the vertical padding for pages that fill the viewport themselves. */
    flush?: boolean;
    /** Vertically centres content (login-style); uses `flex-1`, not `min-h-full`, since the footer is a sibling in `.app-main`. */
    center?: boolean;
    class?: string;
    children?: Snippet;
  }

  let { width = "wide", flush = false, center = false, class: className = "", children }: Props = $props();
</script>

<div class="mx-auto w-full min-w-0 px-4 sm:px-6 {flush ? '' : 'py-4 sm:py-6'} {center ? 'flex flex-1 flex-col justify-center' : ''} {widths[width]} {className}">
  {@render children?.()}
</div>
