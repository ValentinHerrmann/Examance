<script lang="ts">
  import { untrack } from "svelte";
  import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, Modal, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { HELP_TOPICS, getHelpTopic, type HelpTopic } from "$lib/help/topics";
  import { helpStore, closeHelp, selectHelpTopic } from "$lib/stores/helpStore";
  import HelpTopicContent from "./HelpTopicContent.svelte";
  import HelpTopicList from "./HelpTopicList.svelte";

  // Global help panel, mounted once in the root layout. Two panes from the dialog's `@md` width up; one switching column on phones.
  let query = $state("");

  let open = $derived($helpStore.open);
  let activeId = $derived($helpStore.topicId);
  let activeTopic = $derived(activeId ? getHelpTopic(activeId) : undefined);

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

  let needle = $derived(query.trim().toLowerCase());
  let visibleTopics = $derived(needle
    ? HELP_TOPICS.filter((topic) => haystack(topic, $t).includes(needle))
    : HELP_TOPICS);

  function handleClose() {
    query = "";
    closeHelp();
  }

  // A search that excludes the open topic should not leave a stale pane behind.
  $effect.pre(() => {
    const search = needle;
    const id = activeId;
    const topics = visibleTopics;
    if (search && id && !topics.some((topic) => topic.id === id)) {
      untrack(() => selectHelpTopic(topics.length > 0 ? topics[0].id : null));
    }
  });
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

  {#snippet footer()}
    <Button href="/help" variant="text" iconRight={faArrowRight} onClick={handleClose}>
      {$t("help.ui.openManual")}
    </Button>
  {/snippet}
</Modal>
