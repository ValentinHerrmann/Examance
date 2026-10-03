<script lang="ts">
  import type { GradingKeyConfig, GradeCutoff } from '$lib/db/schema';
  import { getPresetCutoffs } from '$lib/analytics/gradingKey';
  import { t } from '$lib/i18n';

  import InfoTip from "$lib/components/help/InfoTip.svelte";
  const presetBtnBase =
    "cursor-pointer rounded-md border-0 bg-transparent px-[0.65rem] py-[0.35rem] text-xs font-medium text-content transition-all duration-150 ease-[ease] hover:bg-surface-inset hover:text-content";
  const presetBtnActive =
    "cursor-pointer rounded-md border-0 bg-info px-[0.65rem] py-[0.35rem] text-xs font-semibold text-info-contrast shadow-[0_1px_3px_rgba(0,0,0,0.3)]";

  export let gradingKey: GradingKeyConfig = {
    preset: 'linear_50',
    cutoffs: getPresetCutoffs('linear_50'),
  };

  $: if (!gradingKey || !gradingKey.cutoffs || gradingKey.cutoffs.length === 0) {
    gradingKey = {
      preset: 'linear_50',
      cutoffs: getPresetCutoffs('linear_50'),
    };
  }

  function applyPreset(preset: GradingKeyConfig['preset']) {
    gradingKey = {
      preset,
      cutoffs: getPresetCutoffs(preset),
    };
  }

  function handleInputChange() {
    gradingKey.preset = 'custom';
    gradingKey = { ...gradingKey };
  }
</script>

<div class="my-4 flex flex-col gap-5 rounded-xl border border-line bg-surface-sunken p-5">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div class="flex flex-col gap-1">
      <h4 class="m-0 flex items-center gap-2 text-base font-semibold text-content">
        <svg class="h-5 w-5 shrink-0 text-info-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        {$t("exam.gradingKeyEditor.heading")}
        <InfoTip text={$t("help.tips.gradingKey")} topic="examCreation" />
      </h4>
      <p class="m-0 text-xs text-muted">
        {$t("exam.gradingKeyEditor.description")}
      </p>
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap items-center gap-[0.375rem] rounded-md border border-line bg-surface-raised p-1">
      <button
        type="button"
        class={gradingKey.preset === 'linear_50' ? presetBtnActive : presetBtnBase}
        on:click={() => applyPreset('linear_50')}
      >
        {$t("exam.gradingKeyEditor.presets.standard")}
      </button>
      <button
        type="button"
        class={gradingKey.preset === 'linear_40' ? presetBtnActive : presetBtnBase}
        on:click={() => applyPreset('linear_40')}
      >
        {$t("exam.gradingKeyEditor.presets.upperSecondary")}
      </button>
      <button
        type="button"
        class={gradingKey.preset === 'even_split' ? presetBtnActive : presetBtnBase}
        on:click={() => applyPreset('even_split')}
      >
        {$t("exam.gradingKeyEditor.presets.even")}
      </button>
      {#if gradingKey.preset === 'custom'}
        <span class="px-2 font-mono text-xs text-info-fg">{$t("exam.gradingKeyEditor.custom")}</span>
      {/if}
    </div>
  </div>

  <!-- Cutoffs Grid -->
  <div class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
    {#each gradingKey.cutoffs as cutoff, idx}
      <div class="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-3">
        <div class="flex items-center justify-between">
          <span class="inline-flex items-center justify-center rounded-md border border-info/30 bg-info/20 px-2 py-[0.15rem] text-xs font-bold text-info-fg">
            {$t("exam.gradingKeyEditor.gradeLabel", { grade: cutoff.grade })}
          </span>
          <span class="text-xs font-medium text-content">{cutoff.label}</span>
        </div>

        <div class="flex items-center gap-[0.375rem]">
          <span class="text-xs text-muted">{$t("exam.gradingKeyEditor.from")}</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="w-[75px] rounded-md border border-line bg-surface-sunken px-[0.35rem] py-1 text-center text-sm font-semibold text-content focus:border-info focus:shadow-[0_0_0_2px_rgba(99,102,241,0.2)] focus:outline-none"
            bind:value={cutoff.minPercentage}
            on:input={handleInputChange}
          />
          <span class="text-xs text-muted">%</span>
        </div>

        <div class="font-mono text-xs text-muted">
          {#if idx === 0}
            {cutoff.minPercentage}% – 100%
          {:else}
            {cutoff.minPercentage}% – &lt;{gradingKey.cutoffs[idx - 1].minPercentage}%
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
