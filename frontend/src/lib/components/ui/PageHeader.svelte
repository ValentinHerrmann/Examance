<script lang="ts">
  import type { Snippet } from "svelte";
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import HelpButton from "$lib/components/help/HelpButton.svelte";
  import type { HelpTopicId } from "$lib/help/topics";
  import Icon from "./Icon.svelte";

  /** Page/section title bar. Wraps on narrow screens; never accent-coloured. */
  interface Props {
    title: string;
    subtitle?: string | undefined;
    level?: "h1" | "h2";
    /** Renders a subtle "?" next to the title that opens the help panel there. */
    helpTopic?: HelpTopicId | undefined;
    /** Link above the title, e.g. back to the parent list. */
    back?: { href: string; label: string } | undefined;
    meta?: Snippet;
    actions?: Snippet;
  }

  let {
    title,
    subtitle = undefined,
    level = "h1",
    helpTopic = undefined,
    back = undefined,
    meta,
    actions,
  }: Props = $props();
</script>

<div class="mb-4">
  {#if back}
    <a
      href={back.href}
      class="mb-1 inline-flex items-center gap-2 text-sm text-muted no-underline hover:text-content"
    >
      <Icon icon={faArrowLeft} />{back.label}
    </a>
  {/if}
  <div class="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        {#if level === "h1"}
          <h1 class="m-0 min-w-0 text-2xl font-normal break-words text-content">{title}</h1>
        {:else}
          <h2 class="m-0 min-w-0 text-xl font-semibold break-words text-content">{title}</h2>
        {/if}
        {#if helpTopic}
          <HelpButton topic={helpTopic} />
        {/if}
      </div>
      {#if subtitle}
        <p class="mt-1 mb-0 text-sm text-muted">{subtitle}</p>
      {/if}
      {@render meta?.()}
    </div>
    {#if actions}
      <div class="flex flex-wrap items-center gap-2">{@render actions?.()}</div>
    {/if}
  </div>
</div>
