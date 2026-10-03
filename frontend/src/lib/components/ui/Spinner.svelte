<script lang="ts">
  import { faSpinner } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  interface Props {
    /** Inline loading indicator; `label` is announced to screen readers only. */
    label?: string | undefined;
    class?: string;
  }

  let { label = undefined, class: className = "" }: Props = $props();
</script>

<span class="inline-flex items-center {className}" role={label ? "status" : undefined}>
  <Icon icon={faSpinner} spin />
  {#if label}<span class="sr-only">{label}</span>{/if}
</span>
