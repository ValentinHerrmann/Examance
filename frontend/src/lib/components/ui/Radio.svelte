<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLInputAttributes, "group" | "value" | "class" | "type" | "children"> {
    group?: string | number | undefined;
    value: string | number;
    label?: string | undefined;
    id?: string | undefined;
    name?: string | undefined;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
  }

  let {
    group = undefined,
    value,
    label = undefined,
    id = undefined,
    name = undefined,
    disabled = false,
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
    type="radio"
    {value}
    {disabled}
    bind:group
    {onchange}
    class="size-5 shrink-0 cursor-[inherit] accent-primary"
    {...rest}
  />
  {#if label || children}<span class="min-w-0">{#if children}{@render children()}{:else}{label}{/if}</span>{/if}
</label>
