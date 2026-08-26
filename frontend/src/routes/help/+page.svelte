<script lang="ts">
  import { PageShell, PageHeader, Card } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { HELP_TOPICS } from "$lib/help/topics";
  import HelpTopicContent from "$lib/components/help/HelpTopicContent.svelte";
  import HelpTopicList from "$lib/components/help/HelpTopicList.svelte";
</script>

<svelte:head>
  <title>{$t("help.ui.manualTitle")} — Examance</title>
</svelte:head>

<PageShell width="narrow">
  <PageHeader
    level="h1"
    title={$t("help.ui.manualTitle")}
    subtitle={$t("help.ui.manualSubtitle")}
  />

  <Card class="mb-6">
    <h2 class="mt-0 mb-2 text-sm font-semibold tracking-wide text-subtle uppercase">
      {$t("help.ui.contents")}
    </h2>
    <HelpTopicList topics={HELP_TOPICS} variant="anchors" />
  </Card>

  <div class="flex flex-col gap-4">
    {#each HELP_TOPICS as topic (topic.id)}
      <Card>
        <!-- `scroll-mt` keeps the heading clear of the sticky app header when
             a /help#topic link jumps to it. -->
        <h2
          id={topic.id}
          class="mt-0 mb-3 flex scroll-mt-20 items-center gap-2 text-lg font-bold text-accent"
        >
          <span aria-hidden="true">{topic.icon}</span>
          {$t(topic.titleKey)}
        </h2>
        <HelpTopicContent {topic} level="h3" />
      </Card>
    {/each}
  </div>
</PageShell>
