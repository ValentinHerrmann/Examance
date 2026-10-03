<script lang="ts">
  import { t } from "$lib/i18n";
  import { openHelp } from "$lib/stores/helpStore";
  import HelpButton from "$lib/components/help/HelpButton.svelte";
</script>

<div class="mx-auto my-8 max-w-[680px] rounded-xl border border-line bg-surface-raised px-8 py-10 text-center">
  <div class="mb-2 text-5xl">🎓</div>
  <h3 class="mb-2 text-2xl text-accent">{$t("dashboard.onboarding.welcome")}</h3>
  <p class="mb-6 text-base text-content">{$t("dashboard.onboarding.intro")}</p>

  <!-- The most prominent element on the very first screen a new teacher sees:
       distinct accent color (amber, not the sky-blue used everywhere else),
       full width, above the fold. Everything else on this card assumes the
       reader already knows Examance's concepts; this is the way out of that
       assumption. -->
  <button
    type="button"
    class="mb-8 flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-warning/60 bg-warning/10 px-5 py-4 text-left transition-colors hover:border-warning hover:bg-warning/15"
    on:click={() => openHelp("gettingStarted")}
  >
    <span aria-hidden="true" class="shrink-0 text-3xl">❓</span>
    <span class="min-w-0 flex-1">
      <span class="block text-base font-bold text-warning-fg">{$t("help.ui.onboardingCta")}</span>
      <span class="block text-xs text-warning-fg">{$t("help.ui.onboardingHint")}</span>
    </span>
    <span aria-hidden="true" class="shrink-0 text-xl text-warning-fg">→</span>
  </button>

  <div class="mb-8 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-5 text-left">
    <div class="flex flex-col gap-3 rounded-md border border-line bg-surface-sunken p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-contrast">1</span>
      <div>
        <strong class="mb-1 flex items-center gap-1.5 text-sm text-content">
          {$t("dashboard.onboarding.step1Title")}
          <HelpButton topic="examCreation" size="sm" />
        </strong>
        <p class="m-0 text-xs leading-snug text-muted">{$t("dashboard.onboarding.step1Text")}</p>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-md border border-line bg-surface-sunken p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-contrast">2</span>
      <div>
        <strong class="mb-1 flex items-center gap-1.5 text-sm text-content">
          {$t("dashboard.onboarding.step2Title")}
          <HelpButton topic="exercises" size="sm" />
        </strong>
        <p class="m-0 text-xs leading-snug text-muted">{$t("dashboard.onboarding.step2Text")}</p>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-md border border-line bg-surface-sunken p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-contrast">3</span>
      <div>
        <strong class="mb-1 flex items-center gap-1.5 text-sm text-content">
          {$t("dashboard.onboarding.step3Title")}
          <HelpButton topic="grading" size="sm" />
        </strong>
        <p class="m-0 text-xs leading-snug text-muted">{$t("dashboard.onboarding.step3Text")}</p>
      </div>
    </div>
  </div>

  <div class="flex flex-wrap justify-center gap-4">
    <a href="/exam/new" class="rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-contrast no-underline hover:bg-primary">{$t("dashboard.onboarding.createFirst")}</a>
    <label for="importFile" class="cursor-pointer rounded-md bg-surface-inset px-5 py-2.5 font-semibold text-content hover:bg-surface-inset">{$t("dashboard.onboarding.importArchive")}</label>
  </div>

  <p class="mx-auto mt-6 mb-0 max-w-md text-xs leading-relaxed text-muted">
    <a href="/help" class="text-accent no-underline hover:underline">{$t("help.ui.onboardingLink")} →</a>
  </p>
</div>
