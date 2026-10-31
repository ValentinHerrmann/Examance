<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Field, controlClass } from "#lib/components/ui";
  import SuggestInput from "./SuggestInput.svelte";

  /** `Field` around a `SuggestInput`: the given `id` is the label's `for`, so `getByLabel` finds the input. */
  interface Props extends Omit<ComponentProps<typeof SuggestInput>, "class"> {
    label: string;
    hint?: string | undefined;
    /** Classes of the field box (spacing, column span). */
    class?: string;
  }

  let { label, hint = undefined, id = undefined, value = $bindable(""), class: className = "", ...rest }: Props = $props();
</script>

<Field {label} {hint} forId={id} class={className}>
  {#snippet children({ id: fieldId })}
    <SuggestInput id={fieldId} bind:value class={controlClass} {...rest} />
  {/snippet}
</Field>
