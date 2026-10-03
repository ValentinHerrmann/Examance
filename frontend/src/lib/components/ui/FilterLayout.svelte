<script lang="ts">
  import type { Snippet } from "svelte";
  import FilterDrawer from "./FilterDrawer.svelte";

  /**
   * Overview-page layout: filters left from `lg` (sticky), in a drawer below it, list on the right.
   * The `filters` snippet renders in both places; its `close` closes the drawer (no-op in the sidebar).
   */
  interface Props {
    title: string;
    toggleLabel: string;
    activeCount?: number;
    /** A refresh is running: the list stays, dimmed and marked busy. */
    busy?: boolean;
    filters?: Snippet<[{ close: () => void }]>;
    children?: Snippet;
  }

  let {
    title,
    toggleLabel,
    activeCount = 0,
    busy = false,
    filters,
    children,
  }: Props = $props();

  let open = $state(false);
</script>

<FilterDrawer bind:open {title} {toggleLabel} {activeCount}>
  {@render filters?.({ close: () => (open = false) })}
</FilterDrawer>

<div class="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
  <div class="sticky top-2 hidden max-h-[calc(100dvh-1rem)] min-w-0 overflow-y-auto lg:block">
    {@render filters?.({ close: () => {} })}
  </div>
  <div class="min-w-0 transition-opacity {busy ? 'opacity-60' : ''}" aria-busy={busy}>
    {@render children?.()}
  </div>
</div>
