<script lang="ts">
  import { controlClass } from "./inputStyles";

  export let value = "";
  export let type: "text" | "email" | "password" | "number" | "search" | "date" = "text";
  export let id: string | undefined = undefined;
  export let placeholder: string | undefined = undefined;
  export let disabled = false;
  export let required = false;

  let className = "";
  export { className as class };

  // `type` cannot be bound dynamically alongside `bind:value` in Svelte, so the
  // input is set up once and the value flows through a manual handler.
  function onInput(event: Event) {
    value = (event.currentTarget as HTMLInputElement).value;
  }
</script>

<input
  {id}
  {type}
  {placeholder}
  {disabled}
  {required}
  {value}
  on:input={onInput}
  on:change
  on:blur
  on:focus
  on:keydown
  class="{controlClass} {className}"
  {...$$restProps}
/>
