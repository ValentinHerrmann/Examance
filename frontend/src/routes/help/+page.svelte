<script lang="ts">
  import { PageShell, PageHeader, Card, Icon } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { HELP_TOPICS } from "#lib/help/topics";
  import HelpTopicContent from "#lib/components/help/HelpTopicContent.svelte";
  import SectionNav from "#lib/components/settings/SectionNav.svelte";

  let navItems = $derived(HELP_TOPICS.map((topic) => ({
    id: topic.id,
    label: $t(topic.titleKey),
    icon: topic.icon,
  })));
</script>

<svelte:head>
  <title>{$t("help.ui.manualTitle")} — Examance</title>
</svelte:head>

<PageShell width="wide">
  <PageHeader
    level="h1"
    title={$t("help.ui.manualTitle")}
    subtitle={$t("help.ui.manualSubtitle")}
  />

  <div class="lg:flex lg:items-start lg:gap-8">
    <SectionNav items={navItems} ariaLabel={$t("help.ui.contents")} />

    <div class="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
      {#each HELP_TOPICS as topic (topic.id)}
        <!-- `scroll-mt` keeps the heading clear of the sticky topic strip when
             a /help#topic link jumps to it. -->
        <div id={topic.id} class="scroll-mt-16 lg:scroll-mt-4">
          <Card>
            <h2 class="mt-0 mb-3 flex items-center gap-2 text-xl font-medium text-content">
              <Icon icon={topic.icon} class="text-muted" />
              {$t(topic.titleKey)}
            </h2>
            <HelpTopicContent {topic} level="h3" />
          </Card>
        </div>
      {/each}
    </div>
  </div>
</PageShell>
