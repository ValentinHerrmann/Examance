<script lang="ts">
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
  class="modal-backdrop"
  role="button"
  tabindex="0"
  on:click={onClose}
  on:keydown={(e) => e.key === "Escape" && onClose()}
>
  <div
    class="modal-drawer"
    role="dialog"
    aria-modal="true"
    on:click|stopPropagation
  >
    <div class="modal-header">
      <div>
        <div class="modal-title-row">
          <h3>{previewModalEx.name}</h3>
          {#if previewModalEx.variantKey && previewModalEx.variantKey !== "_General"}
            <span class="variant-key-tag">{previewModalEx.variantKey}</span>
          {/if}
        </div>
        <div class="modal-meta-pills">
          {#if previewModalEx.topicTag}
            <span class="topic-badge">{previewModalEx.topicTag}</span>
          {/if}
          <span class="score-badge">{modalScore} Pkt</span>
          <span class="variant-version-badge"
            >Version {previewModalEx.version}</span
          >
          {#if previewModalEx.questionType}
            <span class="question-type-badge"
              >{previewModalEx.questionType}</span
            >
          {/if}
        </div>
      </div>
      <button class="modal-close-btn" on:click={onClose}>✕</button>
    </div>

    <div class="modal-body">
      <div class="latex-code-section">
        <div class="section-label">LaTeX Source Code</div>
        <LatexViewer code={previewModalEx.latexBody || "\\begin{Aufgabe}{}\n\\end{Aufgabe}"} maxHeight="350px" />
      </div>
    </div>

    <div class="modal-footer">
      <button
        type="button"
        class="modal-select-btn"
        class:selected={isModalSelected}
        on:click={() => onToggleSelection(previewModalEx.id)}
      >
        {isModalSelected
          ? "✓ Selected in Exam (Click to Remove)"
          : "+ Select for Exam"}
      </button>
      <button
        type="button"
        class="modal-edit-btn"
        on:click={() => onQuickEdit(previewModalEx)}
      >
        ✏️ Quick Edit
      </button>
      <button
        type="button"
        class="modal-cancel-btn"
        on:click={onClose}
      >
        Close
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(3px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-drawer {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 100%;
    max-width: 700px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #334155;
    background: #0f172a;
  }

  .modal-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .modal-title-row h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 1.15rem;
  }

  .modal-meta-pills {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .topic-badge {
    font-size: 0.75rem;
    background: #334155;
    color: #cbd5e1;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .score-badge {
    background: #0369a1;
    color: #e0f2fe;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .variant-key-tag {
    font-size: 0.75rem;
    background: #334155;
    color: #cbd5e1;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .variant-version-badge {
    font-size: 0.75rem;
    background: #334155;
    color: #cbd5e1;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }

  .question-type-badge {
    font-size: 0.75rem;
    background: #475569;
    color: #f1f5f9;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .modal-close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    line-height: 1;
    border-radius: 4px;
  }

  .modal-close-btn:hover {
    color: white;
    background: #334155;
  }

  .modal-body {
    padding: 1.25rem 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .latex-code-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .section-label {
    font-size: 0.78rem;
    color: #94a3b8;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-top: 1px solid #334155;
    background: #0f172a;
  }

  .modal-select-btn {
    background: #0284c7;
    color: white;
    border: none;
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .modal-select-btn:hover {
    background: #0369a1;
  }

  .modal-select-btn.selected {
    background: #16a34a;
  }

  .modal-select-btn.selected:hover {
    background: #15803d;
  }

  .modal-cancel-btn {
    background: #334155;
    color: #cbd5e1;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .modal-cancel-btn:hover {
    background: #475569;
    color: white;
  }

  .modal-edit-btn {
    background: #334155;
    color: #38bdf8;
    border: 1px solid #475569;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .modal-edit-btn:hover {
    background: #475569;
  }
</style>
