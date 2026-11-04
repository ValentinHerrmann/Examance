<script lang="ts">
  import type { Snippet } from "svelte";
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import HelpButton from "#lib/components/help/HelpButton.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import type { HelpTopicId } from "#lib/help/topics";
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
    /** Muted prefix on the title's line, e.g. the exam a step page belongs to. */
    context?: string | undefined;
    /** An explanation shown behind an info icon instead of a subtitle line (saves a row). */
    hint?: string | undefined;
    meta?: Snippet;
    actions?: Snippet;
  }

  let {
    title,
    subtitle = undefined,
    level = "h1",
    helpTopic = undefined,
    back = undefined,
    context = undefined,
    hint = undefined,
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
          <h1 class="m-0 flex min-w-0 items-baseline gap-2 text-2xl font-normal break-words text-content">
            {#if context}<span class="max-w-[24ch] truncate text-base text-muted" title={context}>{context}</span><span class="text-base text-muted" aria-hidden="true">/</span>{/if}<span class="min-w-0">{title}</span>
          </h1>
        {:else}
          <h2 class="m-0 min-w-0 text-xl font-semibold break-words text-content">{title}</h2>
        {/if}
        {#if hint}<InfoTip text={hint} />{/if}
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
