<script lang="ts">
  import { controlClass, controlSmClass } from "./inputStyles";

  export let value: string = "";
  export let id: string | undefined = undefined;
  export let disabled = false;
  export let size: "sm" | "md" = "md";
  export let invalid = false;

  let className = "";
  export { className as class };
</script>

<select
  {id}
  {disabled}
  bind:value
  aria-invalid={invalid ? "true" : undefined}
  on:change
  class="{controlClass} {size === 'sm' ? controlSmClass : ''} {className}"
  {...$$restProps}
>
  <slot />
</select>
