<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { controlClass, controlSmClass } from "./inputStyles";

  interface Props extends Omit<HTMLTextareaAttributes, "value" | "class"> {
    value?: string;
    rows?: number;
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
    rows = 4,
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

  // Sync the bound value before the caller's handler runs, so it never sees a stale `value`.
  function handleInput(e: Parameters<NonNullable<typeof oninput>>[0]) {
    value = e.currentTarget.value;
    oninput?.(e);
  }
</script>

<textarea
  {id}
  {rows}
  {placeholder}
  {disabled}
  {required}
  bind:value
  aria-invalid={invalid ? "true" : undefined}
  oninput={handleInput}
  {onchange}
  {onblur}
  {onfocus}
  {onkeydown}
  class="{controlClass} {size === 'sm' ? controlSmClass : ''} resize-y {className}"
  {...rest}
></textarea>
