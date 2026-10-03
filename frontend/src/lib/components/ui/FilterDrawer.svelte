<script lang="ts">
  import { faFilter } from "@fortawesome/free-solid-svg-icons";
  import Badge from "./Badge.svelte";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";

  /**
   * Below `lg` the filter panel would otherwise stack on top of the list and
   * bury it, so it moves into a drawer opened from a full-width button. One
   * breakpoint owns both the layout and the toggle. The default slot holds
   * the filter panel and is rendered into the drawer's modal; the desktop
   * sidebar is rendered separately by the page. The badge count makes active
   * filters visible without opening the drawer.
   */
  export let open = false;
  export let title: string;
  export let toggleLabel: string;
  export let activeCount = 0;
</script>

<div class="mb-3 lg:hidden">
  <Button variant="outlined" severity="secondary" icon={faFilter} block onClick={() => (open = true)}>
    {toggleLabel}
    {#if activeCount > 0}
      <Badge severity="primary" size="xs">{activeCount}</Badge>
    {/if}
  </Button>
</div>

<Modal {open} size="small" {title} onClose={() => (open = false)}>
  <slot></slot>
</Modal>
