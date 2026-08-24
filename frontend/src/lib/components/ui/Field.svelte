<script lang="ts">
  /** Label + control + optional hint/error wrapper. One name, one spacing. */
  export let label: string | undefined = undefined;
  export let forId: string | undefined = undefined;
  export let hint: string | undefined = undefined;
  export let error: string | undefined = undefined;

  let className = "";
  export { className as class };
</script>

<div class="flex min-w-0 flex-col gap-1.5 {className}">
  {#if label}
    <label class="text-sm font-medium text-muted" for={forId}>{label}</label>
  {/if}
  <slot />
  {#if error}
    <p class="m-0 text-xs text-red-400">{error}</p>
  {:else if hint}
    <p class="m-0 text-xs text-subtle">{hint}</p>
  {/if}
</div>
