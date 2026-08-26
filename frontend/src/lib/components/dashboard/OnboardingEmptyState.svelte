<script lang="ts">
  import { t } from "$lib/i18n";
  import { openHelp } from "$lib/stores/helpStore";
  import HelpButton from "$lib/components/help/HelpButton.svelte";
</script>

<div class="mx-auto my-8 max-w-[680px] rounded-xl border border-slate-700 bg-slate-800 px-8 py-10 text-center">
  <div class="mb-2 text-5xl">🎓</div>
  <h3 class="mb-2 text-2xl text-sky-400">{$t("dashboard.onboarding.welcome")}</h3>
  <p class="mb-6 text-[0.95rem] text-slate-300">{$t("dashboard.onboarding.intro")}</p>

  <!-- The most prominent element on the very first screen a new teacher sees:
       distinct accent color (amber, not the sky-blue used everywhere else),
       full width, above the fold. Everything else on this card assumes the
       reader already knows Examance's concepts; this is the way out of that
       assumption. -->
  <button
    type="button"
    class="mb-8 flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-amber-400/60 bg-amber-400/10 px-5 py-4 text-left transition-colors hover:border-amber-400 hover:bg-amber-400/15"
    on:click={() => openHelp("gettingStarted")}
  >
    <span aria-hidden="true" class="shrink-0 text-3xl">❓</span>
    <span class="min-w-0 flex-1">
      <span class="block text-base font-bold text-amber-300">{$t("help.ui.onboardingCta")}</span>
      <span class="block text-xs text-amber-100/80">{$t("help.ui.onboardingHint")}</span>
    </span>
    <span aria-hidden="true" class="shrink-0 text-xl text-amber-300">→</span>
  </button>

  <div class="mb-8 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-5 text-left">
    <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">1</span>
      <div>
        <strong class="mb-1 flex items-center gap-1.5 text-sm text-slate-50">
          {$t("dashboard.onboarding.step1Title")}
          <HelpButton topic="examCreation" size="sm" />
        </strong>
        <p class="m-0 text-xs leading-snug text-slate-400">{$t("dashboard.onboarding.step1Text")}</p>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">2</span>
      <div>
        <strong class="mb-1 flex items-center gap-1.5 text-sm text-slate-50">
          {$t("dashboard.onboarding.step2Title")}
          <HelpButton topic="exercises" size="sm" />
        </strong>
        <p class="m-0 text-xs leading-snug text-slate-400">{$t("dashboard.onboarding.step2Text")}</p>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">3</span>
      <div>
        <strong class="mb-1 flex items-center gap-1.5 text-sm text-slate-50">
          {$t("dashboard.onboarding.step3Title")}
          <HelpButton topic="grading" size="sm" />
        </strong>
        <p class="m-0 text-xs leading-snug text-slate-400">{$t("dashboard.onboarding.step3Text")}</p>
      </div>
    </div>
  </div>

  <div class="flex flex-wrap justify-center gap-4">
    <a href="/exam/new" class="rounded-md bg-sky-600 px-5 py-2.5 font-semibold text-white no-underline hover:bg-sky-700">{$t("dashboard.onboarding.createFirst")}</a>
    <label for="importFile" class="cursor-pointer rounded-md bg-slate-700 px-5 py-2.5 font-semibold text-white hover:bg-slate-600">{$t("dashboard.onboarding.importArchive")}</label>
  </div>

  <p class="mx-auto mt-6 mb-0 max-w-md text-xs leading-relaxed text-slate-400">
    <a href="/help" class="text-sky-400 no-underline hover:underline">{$t("help.ui.onboardingLink")} →</a>
  </p>
</div>
