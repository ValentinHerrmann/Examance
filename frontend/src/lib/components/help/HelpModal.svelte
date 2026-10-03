<script lang="ts">
  import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, Modal, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { HELP_TOPICS, getHelpTopic, type HelpTopic } from "$lib/help/topics";
  import { helpStore, closeHelp, selectHelpTopic } from "$lib/stores/helpStore";
  import HelpTopicContent from "./HelpTopicContent.svelte";
  import HelpTopicList from "./HelpTopicList.svelte";

  /**
   * The global help panel. Mounted once in the root layout and opened from the
   * navbar, the footer, the contextual "?" buttons or F1.
   *
   * Two panes from the dialog's `@md` container width up (index left, topic right); on a phone it is one
   * column that switches between index and topic, on top of the full-sheet
   * shape `Modal` already provides.
   */
  let query = "";

  $: open = $helpStore.open;
  $: activeId = $helpStore.topicId;
  $: activeTopic = activeId ? getHelpTopic(activeId) : undefined;

  /** Everything a topic says, flattened once so the filter can match on it. */
  function haystack(topic: HelpTopic, translate: typeof $t): string {
    const parts = [translate(topic.titleKey), translate(topic.summaryKey)];
    for (const section of topic.sections) {
      parts.push(translate(section.headingKey));
      for (const key of section.bodyKeys) parts.push(translate(key));
      for (const key of section.bulletKeys ?? []) parts.push(translate(key));
    }
    return parts.join(" ").toLowerCase();
  }

  $: needle = query.trim().toLowerCase();
  $: visibleTopics = needle
    ? HELP_TOPICS.filter((topic) => haystack(topic, $t).includes(needle))
    : HELP_TOPICS;

  // A search that excludes the open topic should not leave a stale pane behind.
  $: if (needle && activeId && !visibleTopics.some((topic) => topic.id === activeId)) {
    selectHelpTopic(visibleTopics.length > 0 ? visibleTopics[0].id : null);
  }

  function handleClose() {
    query = "";
    closeHelp();
  }
</script>

<Modal {open} size="large" title={$t("help.ui.title")} onClose={handleClose}>
  <div class="flex min-w-0 flex-col gap-3">
    <TextInput
      type="search"
      bind:value={query}
      placeholder={$t("help.ui.searchPlaceholder")}
      aria-label={$t("help.ui.searchPlaceholder")}
    />

    {#if visibleTopics.length === 0}
      <p class="m-0 text-sm text-muted">{$t("help.ui.noResults", { query })}</p>
    {:else}
      <div class="flex min-w-0 flex-col gap-4 @md:flex-row @md:items-start">
        <!-- Phone: the index is only shown while no topic is selected. -->
        <nav
          class="min-w-0 @md:w-60 @md:shrink-0 @md:border-r @md:border-line @md:pr-3 {activeTopic
            ? 'hidden @md:block'
            : 'block'}"
          aria-label={$t("help.ui.contents")}
        >
          <HelpTopicList
            topics={visibleTopics}
            {activeId}
            compact
            onSelect={(id) => selectHelpTopic(id)}
          />
        </nav>

        {#if activeTopic}
          <div class="min-w-0 flex-1">
            <Button
              variant="text"
              size="sm"
              icon={faArrowLeft}
              class="mb-3 @md:hidden"
              onClick={() => selectHelpTopic(null)}
            >
              {$t("help.ui.backToOverview")}
            </Button>
            <h3 class="mt-0 mb-2 flex items-center gap-2 text-lg font-semibold text-content">
              <Icon icon={activeTopic.icon} class="text-muted" />
              {$t(activeTopic.titleKey)}
            </h3>
            <HelpTopicContent topic={activeTopic} />
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <Button href="/help" variant="text" iconRight={faArrowRight} onClick={handleClose}>
      {$t("help.ui.openManual")}
    </Button>
  </svelte:fragment>
</Modal>
