<script lang="ts">
  /** The standard raised card: no border, soft shadow. Optional title row. */
  export let padded = true;
  export let tone: "default" | "danger" | "warning" = "default";
  export let title: string | undefined = undefined;

  const tones: Record<string, string> = {
    default: "",
    danger: "border border-danger/40",
    warning: "border border-warning/40",
  };

  let className = "";
  export { className as class };
</script>

<section
  class="min-w-0 rounded-xl bg-surface-raised shadow-sm {tones[tone]} {padded ? 'p-5' : ''} {className}"
>
  {#if title || $$slots.actions}
    <header class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {#if title}<h2 class="m-0 min-w-0 text-xl font-medium text-content">{title}</h2>{/if}
      {#if $$slots.actions}
        <div class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
      {/if}
    </header>
  {/if}
  <slot />
</section>
