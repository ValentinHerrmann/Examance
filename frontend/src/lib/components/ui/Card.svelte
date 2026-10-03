<script lang="ts">
  import type { Snippet } from "svelte";

  const tones: Record<string, string> = {
    default: "",
    danger: "border border-danger/40",
    warning: "border border-warning/40",
  };

  /** The standard raised card: no border, soft shadow. Optional title row. */
  interface Props {
    padded?: boolean;
    tone?: "default" | "danger" | "warning";
    title?: string | undefined;
    class?: string;
    actions?: Snippet;
    children?: Snippet;
  }

  let {
    padded = true,
    tone = "default",
    title = undefined,
    class: className = "",
    actions,
    children,
  }: Props = $props();
</script>

<section
  class="min-w-0 rounded-xl bg-surface-raised shadow-sm {tones[tone]} {padded ? 'p-5' : ''} {className}"
>
  {#if title || actions}
    <header class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {#if title}<h2 class="m-0 min-w-0 text-xl font-medium text-content">{title}</h2>{/if}
      {#if actions}
        <div class="flex flex-wrap items-center gap-2">{@render actions?.()}</div>
      {/if}
    </header>
  {/if}
  {@render children?.()}
</section>
