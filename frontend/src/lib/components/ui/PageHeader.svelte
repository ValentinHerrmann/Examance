<script lang="ts">
  import HelpButton from "$lib/components/help/HelpButton.svelte";
  import type { HelpTopicId } from "$lib/help/topics";

  /**
   * Page/section heading with an optional actions slot. Wraps on narrow
   * screens instead of squeezing the title, which is what the ~15 bespoke
   * `*-header` flex rules all got wrong.
   */
  export let title: string;
  export let subtitle: string | undefined = undefined;
  export let level: "h1" | "h2" = "h2";
  /** Renders a subtle "?" next to the title that opens the help panel there. */
  export let helpTopic: HelpTopicId | undefined = undefined;
</script>

<!-- Stacked on phones: side by side, a nowrap action button squeezes the
     title into a two-character column. -->
<div class="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between lg:mb-6">
  <div class="min-w-0 flex-1">
    <div class="flex min-w-0 items-center gap-2">
      {#if level === "h1"}
        <h1 class="m-0 min-w-0 text-2xl font-bold break-words text-accent lg:text-3xl">{title}</h1>
      {:else}
        <h2 class="m-0 min-w-0 text-xl font-bold break-words text-accent lg:text-2xl">{title}</h2>
      {/if}
      {#if helpTopic}
        <HelpButton topic={helpTopic} />
      {/if}
    </div>
    {#if subtitle}
      <p class="mt-1 mb-0 text-sm text-muted">{subtitle}</p>
    {/if}
    <slot name="meta" />
  </div>
  {#if $$slots.actions}
    <div class="flex flex-wrap items-center gap-2 sm:shrink-0">
      <slot name="actions" />
    </div>
  {/if}
</div>
