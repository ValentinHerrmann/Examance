<script lang="ts">
  export let checked = false;
  export let disabled = false;
  export let id: string | undefined = undefined;
  /** Accessible name when there is no visible `label`. */
  export let ariaLabel: string | undefined = undefined;
  export let label: string | undefined = undefined;
  export let onChange: ((checked: boolean) => void) | undefined = undefined;

  let className = "";
  export { className as class };

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onChange?.(checked);
  }
</script>

<span class="inline-flex min-h-6 items-center gap-2 pointer-coarse:min-h-11 {className}">
  <button
    {id}
    type="button"
    role="switch"
    aria-checked={checked ? "true" : "false"}
    aria-label={label ? undefined : ariaLabel}
    {disabled}
    on:click={toggle}
    class="relative h-6 w-10 shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60 {checked
      ? 'bg-primary'
      : 'bg-line-strong'}"
    {...$$restProps}
  >
    <span
      class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-xs transition-transform {checked
        ? 'translate-x-4'
        : ''}"
    ></span>
  </button>
  {#if label}<span class="text-base text-content">{label}</span>{/if}
</span>
