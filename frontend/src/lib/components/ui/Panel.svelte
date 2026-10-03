<script lang="ts">
  import type { Snippet } from "svelte";

  /** Bordered panel (Artemis `p-panel`): optional header row, padded body. */
  interface Props {
    title?: string | undefined;
    /** Drops the body padding (tables, lists that run edge to edge). */
    bare?: boolean;
    class?: string;
    actions?: Snippet;
    children?: Snippet;
  }

  let { title = undefined, bare = false, class: className = "", actions, children }: Props = $props();
</script>

<section class="min-w-0 rounded-md border border-line bg-surface-raised {className}">
  {#if title || actions}
    <header
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3"
    >
      {#if title}<h3 class="m-0 min-w-0 text-base font-semibold text-content">{title}</h3>{/if}
      {#if actions}
        <div class="flex flex-wrap items-center gap-2">{@render actions?.()}</div>
      {/if}
    </header>
  {/if}
  <div class={bare ? "" : "p-4"}>{@render children?.()}</div>
</section>
