<script lang="ts">
  export let checked = false;
  export let label: string | undefined = undefined;
  export let id: string | undefined = undefined;
  export let disabled = false;
  export let required = false;
  export let invalid = false;
  export let name: string | undefined = undefined;
  export let onChange: ((checked: boolean) => void) | undefined = undefined;

  let className = "";
  export { className as class };
</script>

<label
  class="inline-flex min-h-6 cursor-pointer items-center gap-2 text-base text-content pointer-coarse:min-h-11 {disabled
    ? 'cursor-not-allowed opacity-70'
    : ''} {className}"
>
  <input
    {id}
    {name}
    type="checkbox"
    {disabled}
    {required}
    bind:checked
    aria-invalid={invalid ? "true" : undefined}
    on:change={() => onChange?.(checked)}
    class="size-5 shrink-0 cursor-[inherit] rounded-sm accent-primary"
    {...$$restProps}
  />
  {#if label || $$slots.default}<span class="min-w-0"><slot>{label}</slot></span>{/if}
</label>
