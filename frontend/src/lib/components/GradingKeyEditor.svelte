<script lang="ts">
  import './GradingKeyEditor.css';
  import type { GradingKeyConfig, GradeCutoff } from '$lib/db/schema';
  import { getPresetCutoffs } from '$lib/analytics/gradingKey';

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

<div class="grading-key-editor-grading-key-editor">
  <div class="grading-key-editor-editor-header">
    <div class="grading-key-editor-title-group">
      <h4 class="grading-key-editor-title">
        <svg class="grading-key-editor-header-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Notenschlüssel (Noten 1 bis 6)
      </h4>
      <p class="grading-key-editor-subtitle">
        Definiere die Mindestprozentgrenzen für die automatische Notenberechnung in der Korrekturansicht.
      </p>
    </div>

    <!-- Presets -->
    <div class="grading-key-editor-presets-bar">
      <button
        type="button"
        class="grading-key-editor-preset-btn"
        class:grading-key-editor-active={gradingKey.preset === 'linear_50'}
        on:click={() => applyPreset('linear_50')}
      >
        Klassisch (50% = Note 4)
      </button>
      <button
        type="button"
        class="grading-key-editor-preset-btn"
        class:grading-key-editor-active={gradingKey.preset === 'linear_40'}
        on:click={() => applyPreset('linear_40')}
      >
        Oberstufe (40% = Note 4)
      </button>
      <button
        type="button"
        class="grading-key-editor-preset-btn"
        class:grading-key-editor-active={gradingKey.preset === 'even_split'}
        on:click={() => applyPreset('even_split')}
      >
        Gleichmäßig
      </button>
      {#if gradingKey.preset === 'custom'}
        <span class="grading-key-editor-custom-badge">Individuell</span>
      {/if}
    </div>
  </div>

  <!-- Cutoffs Grid -->
  <div class="grading-key-editor-cutoffs-grid">
    {#each gradingKey.cutoffs as cutoff, idx}
      <div class="grading-key-editor-cutoff-card">
        <div class="grading-key-editor-card-header">
          <span class="grading-key-editor-grade-badge">
            Note {cutoff.grade}
          </span>
          <span class="grading-key-editor-grade-label">{cutoff.label}</span>
        </div>

        <div class="grading-key-editor-card-input-row">
          <span class="grading-key-editor-input-prefix">Ab</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="grading-key-editor-percentage-input"
            bind:value={cutoff.minPercentage}
            on:input={handleInputChange}
          />
          <span class="grading-key-editor-input-suffix">%</span>
        </div>

        <div class="grading-key-editor-range-hint">
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
