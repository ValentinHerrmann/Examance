<script lang="ts">
  /** Bordered panel (Artemis `p-panel`): optional header row, padded body. */
  export let title: string | undefined = undefined;
  /** Drops the body padding (tables, lists that run edge to edge). */
  export let bare = false;

  let className = "";
  export { className as class };
</script>

<section class="min-w-0 rounded-md border border-line bg-surface-raised {className}">
  {#if title || $$slots.actions}
    <header
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3"
    >
      {#if title}<h3 class="m-0 min-w-0 text-base font-semibold text-content">{title}</h3>{/if}
      {#if $$slots.actions}
        <div class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
      {/if}
    </header>
  {/if}
  <div class={bare ? "" : "p-4"}><slot /></div>
</section>
