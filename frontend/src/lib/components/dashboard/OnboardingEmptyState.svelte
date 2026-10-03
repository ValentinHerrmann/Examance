<script lang="ts">
  import { t } from "#lib/i18n";
  import { faArrowRight, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
  import { openHelp } from "#lib/stores/helpStore";
  import HelpButton from "#lib/components/help/HelpButton.svelte";
  import { Button, Card, EmptyState, Icon } from "#lib/components/ui";

  const steps = [
    { n: 1, title: "dashboard.onboarding.step1Title", text: "dashboard.onboarding.step1Text", topic: "examCreation" },
    { n: 2, title: "dashboard.onboarding.step2Title", text: "dashboard.onboarding.step2Text", topic: "exercises" },
    { n: 3, title: "dashboard.onboarding.step3Title", text: "dashboard.onboarding.step3Text", topic: "grading" },
  ] as const;
</script>

<Card class="@container mx-auto my-4 max-w-3xl">
  <EmptyState title={$t("dashboard.onboarding.welcome")} description={$t("dashboard.onboarding.intro")}>
    <!-- The most prominent element on the very first screen a new teacher sees.
         Everything else here assumes the reader already knows Examance's
         concepts; this is the way out of that assumption. -->
    <Button
      variant="outlined"
      severity="warning"
      block
      class="mt-2 py-3 text-left"
      onClick={() => openHelp("gettingStarted")}
    >
      <Icon icon={faCircleQuestion} class="text-2xl" />
      <span class="min-w-0 flex-1 whitespace-normal">
        <span class="block font-semibold">{$t("help.ui.onboardingCta")}</span>
        <span class="block text-xs font-normal">{$t("help.ui.onboardingHint")}</span>
      </span>
      <Icon icon={faArrowRight} />
    </Button>

    <ol class="m-0 my-4 grid w-full list-none grid-cols-1 gap-x-6 gap-y-4 p-0 text-left @xl:grid-cols-3">
      {#each steps as step}
        <li class="flex min-w-0 flex-col gap-2">
          <span class="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-contrast">{step.n}</span>
          <strong class="flex items-center gap-1.5 text-sm text-content">
            {$t(step.title)}
            <HelpButton topic={step.topic} size="sm" />
          </strong>
          <p class="m-0 text-sm text-muted">{$t(step.text)}</p>
        </li>
      {/each}
    </ol>

    {#snippet actions()}
      <Button href="/exam/new">{$t("dashboard.onboarding.createFirst")}</Button>
      <Button variant="outlined" severity="secondary" onClick={() => document.getElementById("importFile")?.click()}>
        {$t("dashboard.onboarding.importArchive")}
      </Button>
    {/snippet}
  </EmptyState>

  <p class="m-0 text-center text-sm">
    <a href="/help" class="text-accent no-underline hover:underline">{$t("help.ui.onboardingLink")}</a>
    <Icon icon={faArrowRight} class="text-accent" />
  </p>
</Card>
