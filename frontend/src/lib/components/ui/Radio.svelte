<script lang="ts">
  export let group: string | number | undefined = undefined;
  export let value: string | number;
  export let label: string | undefined = undefined;
  export let id: string | undefined = undefined;
  export let name: string | undefined = undefined;
  export let disabled = false;

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
    type="radio"
    {value}
    {disabled}
    bind:group
    on:change
    class="size-5 shrink-0 cursor-[inherit] accent-primary"
    {...$$restProps}
  />
  {#if label || $$slots.default}<span class="min-w-0"><slot>{label}</slot></span>{/if}
</label>
