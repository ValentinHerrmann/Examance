<script lang="ts">
  import type { Snippet } from "svelte";

  /** Wraps a wide table so it scrolls in its own box; tables without this were clipped by the app shell and unreachable. */
  interface Props {
    label?: string | undefined;
    /** Tailwind max-height class (e.g. "max-h-96"). Switches the box to vertical scrolling too, so `.data-table-sticky` headers stick. */
    maxHeight?: string | undefined;
    class?: string;
    children?: Snippet;
  }

  let {
    label = undefined,
    maxHeight = undefined,
    class: className = "",
    children,
  }: Props = $props();
</script>

<!-- `relative` so absolutely positioned content (sr-only header labels) is clipped here, not by `.app-main`, where it widened the page on phones. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="scroll-pane relative w-full min-w-0 {maxHeight ? `overflow-auto ${maxHeight}` : "overflow-x-auto overflow-y-hidden overscroll-x-contain"} {className}"
  role="region"
  aria-label={label}
  tabindex="0"
>
  {@render children?.()}
</div>
