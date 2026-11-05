<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Field, controlClass, controlCompactClass } from "#lib/components/ui";
  import SuggestInput from "./SuggestInput.svelte";

  /** `Field` around a `SuggestInput`: the given `id` is the label's `for`, so `getByLabel` finds the input. */
  interface Props extends Omit<ComponentProps<typeof SuggestInput>, "class"> {
    label: string;
    hint?: string | undefined;
    info?: string | undefined;
    /** Classes of the field box (spacing, column span). */
    class?: string;
    /** Dense form variant (see `Field`). */
    compact?: boolean;
  }

  let { label, hint = undefined, info = undefined, id = undefined, value = $bindable(""), class: className = "", compact = false, ...rest }: Props = $props();
</script>

<Field {label} {hint} {info} {compact} forId={id} class={className}>
  {#snippet children({ id: fieldId })}
    <SuggestInput id={fieldId} bind:value class={compact ? `${controlClass} ${controlCompactClass}` : controlClass} {...rest} />
  {/snippet}
</Field>
