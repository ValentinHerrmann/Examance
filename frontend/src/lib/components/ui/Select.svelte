<script lang="ts">
  import { controlClass } from "./inputStyles";

  export let value: string = "";
  export let id: string | undefined = undefined;
  export let disabled = false;

  let className = "";
  export { className as class };
</script>

<select
  {id}
  {disabled}
  bind:value
  on:change
  class="{controlClass} {className}"
  {...$$restProps}
>
  <slot />
</select>
