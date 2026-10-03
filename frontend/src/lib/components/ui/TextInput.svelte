<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { controlClass, controlSmClass } from "./inputStyles";

  interface Props extends Omit<HTMLInputAttributes, "value" | "type" | "size" | "class"> {
    value?: string;
    type?: "text" | "email" | "password" | "number" | "search" | "date";
    id?: string | undefined;
    placeholder?: string | undefined;
    disabled?: boolean;
    required?: boolean;
    size?: "sm" | "md";
    invalid?: boolean;
    class?: string;
  }

  let {
    value = $bindable(""),
    type = "text",
    id = undefined,
    placeholder = undefined,
    disabled = false,
    required = false,
    size = "md",
    invalid = false,
    oninput = undefined,
    onchange = undefined,
    onblur = undefined,
    onfocus = undefined,
    onkeydown = undefined,
    class: className = "",
    ...rest
  }: Props = $props();

  // `type` cannot be bound dynamically alongside `bind:value`, so the value flows through a manual handler.
  function handleInput(e: Parameters<NonNullable<typeof oninput>>[0]) {
    value = e.currentTarget.value;
    oninput?.(e);
  }
</script>

<input
  {id}
  {type}
  {placeholder}
  {disabled}
  {required}
  {value}
  aria-invalid={invalid ? "true" : undefined}
  oninput={handleInput}
  {onchange}
  {onblur}
  {onfocus}
  {onkeydown}
  class="{controlClass} {size === 'sm' ? controlSmClass : ''} {className}"
  {...rest}
/>
