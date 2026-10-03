<script lang="ts">
  import { controlClass, controlSmClass } from "./inputStyles";

  export let value = "";
  export let rows = 4;
  export let id: string | undefined = undefined;
  export let placeholder: string | undefined = undefined;
  export let disabled = false;
  export let required = false;
  export let size: "sm" | "md" = "md";
  export let invalid = false;

  let className = "";
  export { className as class };
</script>

<textarea
  {id}
  {rows}
  {placeholder}
  {disabled}
  {required}
  bind:value
  aria-invalid={invalid ? "true" : undefined}
  on:input
  on:change
  on:blur
  on:focus
  on:keydown
  class="{controlClass} {size === 'sm' ? controlSmClass : ''} resize-y {className}"
  {...$$restProps}
></textarea>
