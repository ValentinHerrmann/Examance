<script lang="ts">
  import { t } from "$lib/i18n";
</script>

<div class="mx-auto my-8 max-w-[680px] rounded-xl border border-slate-700 bg-slate-800 px-8 py-10 text-center">
  <div class="mb-2 text-5xl">🎓</div>
  <h3 class="mb-2 text-2xl text-sky-400">{$t("dashboard.onboarding.welcome")}</h3>
  <p class="mb-8 text-[0.95rem] text-slate-300">{$t("dashboard.onboarding.intro")}</p>

  <div class="mb-8 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-5 text-left">
    <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">1</span>
      <div>
        <strong class="mb-1 block text-sm text-slate-50">{$t("dashboard.onboarding.step1Title")}</strong>
        <p class="m-0 text-xs leading-snug text-slate-400">{$t("dashboard.onboarding.step1Text")}</p>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">2</span>
      <div>
        <strong class="mb-1 block text-sm text-slate-50">{$t("dashboard.onboarding.step2Title")}</strong>
        <p class="m-0 text-xs leading-snug text-slate-400">{$t("dashboard.onboarding.step2Text")}</p>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">3</span>
      <div>
        <strong class="mb-1 block text-sm text-slate-50">{$t("dashboard.onboarding.step3Title")}</strong>
        <p class="m-0 text-xs leading-snug text-slate-400">{$t("dashboard.onboarding.step3Text")}</p>
      </div>
    </div>
  </div>

  <div class="flex flex-wrap justify-center gap-4">
    <a href="/exam/new" class="rounded-md bg-sky-600 px-5 py-2.5 font-semibold text-white no-underline hover:bg-sky-700">{$t("dashboard.onboarding.createFirst")}</a>
    <label for="importFile" class="cursor-pointer rounded-md bg-slate-700 px-5 py-2.5 font-semibold text-white hover:bg-slate-600">{$t("dashboard.onboarding.importArchive")}</label>
  </div>
</div>
