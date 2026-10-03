<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLSelectAttributes } from "svelte/elements";
  import { controlClass, controlSmClass } from "./inputStyles";

  interface Props extends Omit<HTMLSelectAttributes, "value" | "size" | "class" | "children"> {
    value?: string;
    id?: string | undefined;
    disabled?: boolean;
    size?: "sm" | "md";
    invalid?: boolean;
    class?: string;
    children?: Snippet;
  }

  let {
    value = $bindable(""),
    id = undefined,
    disabled = false,
    size = "md",
    invalid = false,
    onchange = undefined,
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  // Sync the bound value before the caller's handler runs, so it never sees a stale `value`.
  function handleChange(e: Parameters<NonNullable<typeof onchange>>[0]) {
    value = e.currentTarget.value;
    onchange?.(e);
  }
</script>

<select
  {id}
  {disabled}
  bind:value
  aria-invalid={invalid ? "true" : undefined}
  onchange={handleChange}
  class="{controlClass} {size === 'sm' ? controlSmClass : ''} {className}"
  {...rest}
>
  {@render children?.()}
</select>
