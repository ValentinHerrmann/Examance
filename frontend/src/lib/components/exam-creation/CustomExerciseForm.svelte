<script lang="ts">
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import SuggestInput from "#lib/components/common/SuggestInput.svelte";
  import { t } from "#lib/i18n";
  import { Button, Checkbox, Field, TextInput, controlClass } from "#lib/components/ui";
  import { faPlus } from "@fortawesome/free-solid-svg-icons";

  interface Props {
    customName: string;
    customTopicTag: string;
    customLatexBody: string;
    saveCustomToLibrary: boolean;
    onAddCustomExercise: () => void;
  }

  let {
    customName = $bindable(),
    customTopicTag = $bindable(),
    customLatexBody = $bindable(),
    saveCustomToLibrary = $bindable(),
    onAddCustomExercise
  }: Props = $props();
</script>

<div class="@container flex flex-col gap-4">
  <div class="grid grid-cols-1 gap-4 @xl:grid-cols-2">
    <Field label={$t("examCreation.customExerciseForm.nameLabel")} forId="customName">
      <TextInput
        id="customName"
        bind:value={customName}
        placeholder={$t("examCreation.customExerciseForm.namePlaceholder")}
      />
    </Field>
    <Field label={$t("examCreation.customExerciseForm.topicLabel")} forId="customTopic">
      <SuggestInput
        id="customTopic"
        class={controlClass}
        storageKey="exercise.topic"
        bind:value={customTopicTag}
        placeholder={$t("examCreation.customExerciseForm.topicPlaceholder")}
      />
    </Field>
  </div>

  <div class="flex flex-col gap-1.5">
    <!-- \begin{Aufgabe} is a LaTeX environment name, not UI text — left untranslated. -->
    <span class="text-sm font-medium text-content">{$t("examCreation.customExerciseForm.bodyLabel")}</span>
    <LatexEditor bind:value={customLatexBody} rows={6} />
  </div>

  <div class="flex flex-col items-stretch justify-between gap-4 @md:flex-row @md:items-center">
    <Checkbox bind:checked={saveCustomToLibrary} label={$t("examCreation.customExerciseForm.saveToLibraryLabel")} />
    <Button variant="outlined" severity="success" icon={faPlus} class="w-full @md:w-auto" onClick={onAddCustomExercise}>
      {$t("examCreation.customExerciseForm.addButton")}
    </Button>
  </div>
</div>
