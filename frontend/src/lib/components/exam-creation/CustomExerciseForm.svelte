<script lang="ts">
  import "./CustomExerciseForm.css";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { t } from "$lib/i18n";

  export let customName: string;
  export let customTopicTag: string;
  export let customLatexBody: string;
  export let saveCustomToLibrary: boolean;
  export let onAddCustomExercise: () => void;
</script>

<div class="custom-exercise-form">
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div class="custom-exercise-form-group">
      <label for="customName">{$t("examCreation.customExerciseForm.nameLabel")}</label>
      <input
        id="customName"
        type="text"
        bind:value={customName}
        placeholder={$t("examCreation.customExerciseForm.namePlaceholder")}
      />
    </div>
    <div class="custom-exercise-form-group">
      <label for="customTopic">{$t("examCreation.customExerciseForm.topicLabel")}</label>
      <SuggestInput
        id="customTopic"
        storageKey="exercise.topic"
        bind:value={customTopicTag}
        placeholder={$t("examCreation.customExerciseForm.topicPlaceholder")}
      />
    </div>
  </div>

  <div class="custom-exercise-form-group">
    <!-- \begin{Aufgabe} is a LaTeX environment name, not UI text — left untranslated. -->
    <label for="customBody">{$t("examCreation.customExerciseForm.bodyLabel")}</label>
    <LatexEditor bind:value={customLatexBody} rows={6} />
  </div>

  <div class="custom-exercise-form-actions">
    <label class="custom-exercise-form-checkbox-label">
      <input type="checkbox" bind:checked={saveCustomToLibrary} />
      {$t("examCreation.customExerciseForm.saveToLibraryLabel")}
    </label>
    <button
      type="button"
      class="custom-exercise-form-add-btn"
      on:click={onAddCustomExercise}
    >
      {$t("examCreation.customExerciseForm.addButton")}
    </button>
  </div>
</div>
