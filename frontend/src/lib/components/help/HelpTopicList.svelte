<script lang="ts">
  import { t } from "$lib/i18n";
  import { Button, Icon } from "$lib/components/ui";
  import type { HelpTopic, HelpTopicId } from "$lib/help/topics";

  /**
   * The topic index. Used twice: as the panel's navigation (buttons) and as the
   * manual page's table of contents (anchors).
   */
  export let topics: HelpTopic[];
  export let variant: "buttons" | "anchors" = "buttons";
  export let activeId: HelpTopicId | null = null;
  export let compact = false;
  export let onSelect: ((id: HelpTopicId) => void) | undefined = undefined;

  const rowBase =
    "flex w-full min-w-0 items-start gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left no-underline transition-colors hover:border-line hover:bg-surface-inset";
</script>

<ul class="m-0 flex list-none flex-col gap-1 p-0">
  {#each topics as topic (topic.id)}
    <li class="min-w-0">
      {#if variant === "anchors"}
        <a href="#{topic.id}" class="{rowBase} text-content">
          <Icon icon={topic.icon} class="mt-0.5 text-base text-muted" />
          <span class="min-w-0">
            <span class="block text-sm font-medium">{$t(topic.titleKey)}</span>
            {#if !compact}
              <span class="block text-xs text-muted">{$t(topic.summaryKey)}</span>
            {/if}
          </span>
        </a>
      {:else}
        <Button
          variant="text"
          severity="secondary"
          block
          class="h-auto items-start! justify-start! px-2.5! py-2! text-left whitespace-normal! {topic.id === activeId
            ? 'border-primary/40! bg-highlight text-on-highlight!'
            : 'text-content!'}"
          aria-current={topic.id === activeId ? "true" : undefined}
          onClick={() => onSelect?.(topic.id)}
        >
          <Icon icon={topic.icon} class="mt-0.5 text-base text-muted" />
          <span class="min-w-0">
            <span class="block text-sm font-medium">{$t(topic.titleKey)}</span>
            {#if !compact}
              <span class="block text-xs text-muted">{$t(topic.summaryKey)}</span>
            {/if}
          </span>
        </Button>
      {/if}
    </li>
  {/each}
</ul>
