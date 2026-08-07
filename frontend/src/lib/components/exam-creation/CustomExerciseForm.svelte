<script lang="ts">
  import LatexEditor from "$lib/components/LatexEditor.svelte";

  export let customName: string;
  export let customTopicTag: string;
  export let customLatexBody: string;
  export let saveCustomToLibrary: boolean;
  export let onAddCustomExercise: () => void;
</script>

<div class="custom-exercise-form">
  <div class="form-grid">
    <div class="form-group">
      <label for="customName">Exercise Name</label>
      <input
        id="customName"
        type="text"
        bind:value={customName}
        placeholder="Custom_1"
      />
    </div>
    <div class="form-group">
      <label for="customTopic">Topic Tag</label>
      <input
        id="customTopic"
        type="text"
        bind:value={customTopicTag}
        placeholder="_Vererbung"
      />
    </div>
  </div>

  <div class="form-group">
    <label for="customBody"
      >LaTeX Body (\begin&#123;Aufgabe&#125;...)</label
    >
    <LatexEditor bind:value={customLatexBody} rows={6} />
  </div>

  <div class="custom-actions">
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={saveCustomToLibrary} />
      Save to Exercise Library for future exams
    </label>
    <button
      type="button"
      class="add-custom-btn"
      on:click={onAddCustomExercise}
    >
      + Add to Exam
    </button>
  </div>
</div>

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  label {
    font-size: 0.875rem;
    color: #cbd5e1;
  }

  input {
    padding: 0.625rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: white;
  }

  .custom-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .add-custom-btn {
    background: #16a34a;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  @media (max-width: 640px), (max-height: 760px) and (orientation: landscape) {
    .custom-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .add-custom-btn {
      width: 100%;
    }
  }
</style>
