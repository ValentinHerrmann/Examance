<script lang="ts">
  import type { GradingKeyConfig, GradeCutoff } from '$lib/db/schema';
  import { getPresetCutoffs } from '$lib/analytics/gradingKey';
  import { t } from '$lib/i18n';

  import InfoTip from "$lib/components/help/InfoTip.svelte";
  import { faChartColumn } from '@fortawesome/free-solid-svg-icons';
  import { Badge, Button, Icon, controlClass, controlSmClass } from '$lib/components/ui';

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

<div class="my-4 flex flex-col gap-5 rounded-md border border-line bg-surface-sunken p-4">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div class="flex flex-col gap-1">
      <h3 class="m-0 flex items-center gap-2 text-base font-semibold text-content">
        <Icon icon={faChartColumn} class="text-info-fg" />
        {$t("exam.gradingKeyEditor.heading")}
        <InfoTip text={$t("help.tips.gradingKey")} topic="examCreation" />
      </h3>
      <p class="m-0 text-xs text-muted">
        {$t("exam.gradingKeyEditor.description")}
      </p>
    </div>

    <!-- Presets -->
    <div class="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface-raised p-1">
      <Button size="sm" variant="text" severity="secondary" pressed={gradingKey.preset === 'linear_50'} onClick={() => applyPreset('linear_50')}>
        {$t("exam.gradingKeyEditor.presets.standard")}
      </Button>
      <Button size="sm" variant="text" severity="secondary" pressed={gradingKey.preset === 'linear_40'} onClick={() => applyPreset('linear_40')}>
        {$t("exam.gradingKeyEditor.presets.upperSecondary")}
      </Button>
      <Button size="sm" variant="text" severity="secondary" pressed={gradingKey.preset === 'even_split'} onClick={() => applyPreset('even_split')}>
        {$t("exam.gradingKeyEditor.presets.even")}
      </Button>
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
          <Badge severity="info">{$t("exam.gradingKeyEditor.gradeLabel", { grade: cutoff.grade })}</Badge>
          <span class="text-xs font-medium text-content">{cutoff.label}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <span class="text-xs text-muted">{$t("exam.gradingKeyEditor.from")}</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="{controlClass} {controlSmClass} w-20 text-center font-semibold"
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
