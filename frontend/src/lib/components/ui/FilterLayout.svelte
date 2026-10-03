<script lang="ts">
  import FilterDrawer from "./FilterDrawer.svelte";

  /**
   * Overview-page layout: filter panel left from `lg` (sticky), in a drawer
   * below it, list on the right. The `filters` slot is rendered in both
   * places and exposes `close`, which closes the drawer (a no-op in the
   * sidebar) so a pick on a phone can dismiss it.
   */
  export let title: string;
  export let toggleLabel: string;
  export let activeCount = 0;

  let open = false;
</script>

<FilterDrawer bind:open {title} {toggleLabel} {activeCount}>
  <slot name="filters" close={() => (open = false)} />
</FilterDrawer>

<div class="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
  <div class="sticky top-2 hidden max-h-[calc(100dvh-1rem)] min-w-0 overflow-y-auto lg:block">
    <slot name="filters" close={() => {}} />
  </div>
  <div class="min-w-0">
    <slot />
  </div>
</div>
