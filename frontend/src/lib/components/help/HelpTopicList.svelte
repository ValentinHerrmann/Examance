<script lang="ts">
  import { t } from "$lib/i18n";
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
    "flex w-full min-w-0 items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left no-underline transition-colors hover:border-line hover:bg-surface-inset";
</script>

<ul class="m-0 flex list-none flex-col gap-1 p-0">
  {#each topics as topic (topic.id)}
    <li class="min-w-0">
      {#if variant === "anchors"}
        <a href="#{topic.id}" class="{rowBase} text-content">
          <span aria-hidden="true" class="text-base leading-5">{topic.icon}</span>
          <span class="min-w-0">
            <span class="block text-sm font-medium">{$t(topic.titleKey)}</span>
            {#if !compact}
              <span class="block text-xs text-subtle">{$t(topic.summaryKey)}</span>
            {/if}
          </span>
        </a>
      {:else}
        <button
          type="button"
          class="{rowBase} cursor-pointer bg-transparent {topic.id === activeId
            ? 'border-line bg-surface-inset text-accent'
            : 'text-content'}"
          aria-current={topic.id === activeId ? "true" : undefined}
          on:click={() => onSelect?.(topic.id)}
        >
          <span aria-hidden="true" class="text-base leading-5">{topic.icon}</span>
          <span class="min-w-0">
            <span class="block text-sm font-medium">{$t(topic.titleKey)}</span>
            {#if !compact}
              <span class="block text-xs text-subtle">{$t(topic.summaryKey)}</span>
            {/if}
          </span>
        </button>
      {/if}
    </li>
  {/each}
</ul>
