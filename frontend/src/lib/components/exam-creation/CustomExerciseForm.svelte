<script lang="ts">
  import "./CustomExerciseForm.css";
  import LatexEditor from "$lib/components/LatexEditor.svelte";

  export let customName: string;
  export let customTopicTag: string;
  export let customLatexBody: string;
  export let saveCustomToLibrary: boolean;
  export let onAddCustomExercise: () => void;
</script>

<div class="custom-exercise-form">
  <div class="custom-exercise-form-grid">
    <div class="custom-exercise-form-group">
      <label for="customName">Exercise Name</label>
      <input
        id="customName"
        type="text"
        bind:value={customName}
        placeholder="Custom_1"
      />
    </div>
    <div class="custom-exercise-form-group">
      <label for="customTopic">Topic Tag</label>
      <input
        id="customTopic"
        type="text"
        bind:value={customTopicTag}
        placeholder="_Vererbung"
      />
    </div>
  </div>

  <div class="custom-exercise-form-group">
    <label for="customBody"
      >LaTeX Body (\begin&#123;Aufgabe&#125;...)</label
    >
    <LatexEditor bind:value={customLatexBody} rows={6} />
  </div>

  <div class="custom-exercise-form-actions">
    <label class="custom-exercise-form-checkbox-label">
      <input type="checkbox" bind:checked={saveCustomToLibrary} />
      Save to Exercise Library for future exams
    </label>
    <button
      type="button"
      class="custom-exercise-form-add-btn"
      on:click={onAddCustomExercise}
    >
      + Add to Exam
    </button>
  </div>
</div>
