<script lang="ts">
  /**
   * Label + control + optional hint/error wrapper. Without `forId` an id is
   * generated and handed to the slot: `<Field label="x" let:id><TextInput {id} /></Field>`.
   */
  export let label: string | undefined = undefined;
  export let forId: string | undefined = undefined;
  export let hint: string | undefined = undefined;
  export let error: string | undefined = undefined;
  export let required = false;

  let className = "";
  export { className as class };

  const generated = `field-${Math.random().toString(36).slice(2, 10)}`;
  $: id = forId ?? generated;
</script>

<div class="flex min-w-0 flex-col gap-1.5 {className}">
  {#if label}
    <label class="text-sm font-medium text-content" for={id}
      >{label}{#if required}<span class="ml-0.5 text-danger-fg" aria-hidden="true">*</span>{/if}</label
    >
  {/if}
  <slot {id} />
  {#if error}
    <p class="m-0 text-sm text-danger-fg" role="alert">{error}</p>
  {:else if hint}
    <p class="m-0 text-sm text-muted">{hint}</p>
  {/if}
</div>
