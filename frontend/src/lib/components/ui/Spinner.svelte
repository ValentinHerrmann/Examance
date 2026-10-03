<script lang="ts">
  import { faSpinner } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /** Inline loading indicator; `label` is announced to screen readers only. */
  export let label: string | undefined = undefined;

  let className = "";
  export { className as class };
</script>

<span class="inline-flex items-center {className}" role={label ? "status" : undefined}>
  <Icon icon={faSpinner} spin />
  {#if label}<span class="sr-only">{label}</span>{/if}
</span>
