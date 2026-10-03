<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLButtonAttributes, "class" | "id" | "disabled" | "onclick"> {
    checked?: boolean;
    disabled?: boolean;
    id?: string | undefined;
    /** Accessible name when there is no visible `label`. */
    ariaLabel?: string | undefined;
    label?: string | undefined;
    onChange?: ((checked: boolean) => void) | undefined;
    class?: string;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    id = undefined,
    ariaLabel = undefined,
    label = undefined,
    onChange = undefined,
    class: className = "",
    ...rest
  }: Props = $props();

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
    {...rest}
    onclick={toggle}
    class="relative h-6 w-10 shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60 {checked
      ? 'bg-primary'
      : 'bg-line-strong'}"
  >
    <span
      class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-xs transition-transform {checked
        ? 'translate-x-4'
        : ''}"
    ></span>
  </button>
  {#if label}<span class="text-base text-content">{label}</span>{/if}
</span>
