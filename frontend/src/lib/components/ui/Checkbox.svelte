<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLInputAttributes, "checked" | "class" | "type" | "children"> {
    checked?: boolean;
    label?: string | undefined;
    id?: string | undefined;
    disabled?: boolean;
    required?: boolean;
    invalid?: boolean;
    name?: string | undefined;
    onChange?: ((checked: boolean) => void) | undefined;
    class?: string;
    children?: Snippet;
  }

  let {
    checked = $bindable(false),
    label = undefined,
    id = undefined,
    disabled = false,
    required = false,
    invalid = false,
    name = undefined,
    onChange = undefined,
    onchange = undefined,
    class: className = "",
    children,
    ...rest
  }: Props = $props();
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
    onchange={(e) => {
      onChange?.(checked);
      onchange?.(e);
    }}
    class="size-5 shrink-0 cursor-[inherit] rounded-sm accent-primary"
    {...rest}
  />
  {#if label || children}<span class="min-w-0">{#if children}{@render children()}{:else}{label}{/if}</span>{/if}
</label>
