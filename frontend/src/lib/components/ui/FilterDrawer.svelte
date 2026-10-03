<script lang="ts">
  import type { Snippet } from "svelte";
  import { faFilter } from "@fortawesome/free-solid-svg-icons";
  import Badge from "./Badge.svelte";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";

  /**
   * Below `lg` the filter panel moves into a drawer opened from a full-width button (one breakpoint owns
   * layout and toggle). Children are rendered in the drawer modal; the desktop sidebar is rendered by the page.
   */
  interface Props {
    open?: boolean;
    title: string;
    toggleLabel: string;
    activeCount?: number;
    children?: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    toggleLabel,
    activeCount = 0,
    children,
  }: Props = $props();
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
  {@render children?.()}
</Modal>
