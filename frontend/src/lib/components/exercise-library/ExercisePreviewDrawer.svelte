<script lang="ts">
  import "./ExercisePreviewDrawer.css";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
  import LatexViewer from "$lib/components/LatexViewer.svelte";

  export let previewModalEx: ExerciseRecord;
  export let isModalSelected: boolean;
  export let onClose: () => void;
  export let onToggleSelection: (id: string) => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;

  $: modalScore = parseExerciseScore(previewModalEx.latexBody || "") || previewModalEx.maxPoints || 0;
</script>

<div
  class="exercise-preview-drawer-modal-backdrop"
  role="button"
  tabindex="0"
  on:click={onClose}
  on:keydown={(e) => e.key === "Escape" && onClose()}
>
  <div
    class="exercise-preview-drawer-modal-drawer"
    role="dialog"
    aria-modal="true"
    on:click|stopPropagation
  >
    <div class="exercise-preview-drawer-modal-header">
      <div>
        <div class="exercise-preview-drawer-modal-title-row">
          <h3>{previewModalEx.name}</h3>
          {#if previewModalEx.variantKey && previewModalEx.variantKey !== "_General"}
            <span class="exercise-preview-drawer-variant-key-tag">{previewModalEx.variantKey}</span>
          {/if}
        </div>
        <div class="exercise-preview-drawer-modal-meta-pills">
          {#if previewModalEx.topicTag}
            <span class="exercise-preview-drawer-topic-badge">{previewModalEx.topicTag}</span>
          {/if}
          <span class="exercise-preview-drawer-score-badge">{modalScore} Pkt</span>
          <span class="exercise-preview-drawer-variant-version-badge"
            >Version {previewModalEx.version}</span
          >
          {#if previewModalEx.questionType}
            <span class="exercise-preview-drawer-question-type-badge"
              >{previewModalEx.questionType}</span
            >
          {/if}
        </div>
      </div>
      <button class="exercise-preview-drawer-modal-close-btn" on:click={onClose}>✕</button>
    </div>

    <div class="exercise-preview-drawer-modal-body">
      <div class="exercise-preview-drawer-latex-code-section">
        <div class="exercise-preview-drawer-section-label">LaTeX Source Code</div>
        <LatexViewer code={previewModalEx.latexBody || "\\begin{Aufgabe}{}\n\\end{Aufgabe}"} maxHeight="350px" />
      </div>
    </div>

    <div class="exercise-preview-drawer-modal-footer">
      <button
        type="button"
        class="exercise-preview-drawer-modal-select-btn"
        class:selected={isModalSelected}
        on:click={() => onToggleSelection(previewModalEx.id)}
      >
        {isModalSelected
          ? "✓ Selected in Exam (Click to Remove)"
          : "+ Select for Exam"}
      </button>
      <button
        type="button"
        class="exercise-preview-drawer-modal-edit-btn"
        on:click={() => onQuickEdit(previewModalEx)}
      >
        ✏️ Quick Edit
      </button>
      <button
        type="button"
        class="exercise-preview-drawer-modal-cancel-btn"
        on:click={onClose}
      >
        Close
      </button>
    </div>
  </div>
</div>

