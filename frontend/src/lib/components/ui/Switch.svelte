<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLButtonAttributes, "class" | "id" | "disabled" | "onclick"> {
    checked?: boolean;
    disabled?: boolean;
    id?: string | undefined;
    /** Accessible name; defaults to the visible `label`. */
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
    aria-label={ariaLabel ?? label}
    {disabled}
    {...rest}
    onclick={toggle}
    class="group inline-flex h-6 w-10 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:h-11"
  >
    <!-- The pill is drawn inside the button: on coarse pointers the button grows to a 44px hit area
         (app.css gives every button that minimum height), and the pill must not stretch with it. -->
    <span
      class="relative block h-6 w-10 rounded-full transition-colors {checked ? 'bg-primary' : 'bg-line-strong'}"
    >
      <span
        class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-xs transition-transform {checked
          ? 'translate-x-4'
          : ''}"
      ></span>
    </span>
  </button>
  {#if label}<span class="text-base text-content">{label}</span>{/if}
</span>
