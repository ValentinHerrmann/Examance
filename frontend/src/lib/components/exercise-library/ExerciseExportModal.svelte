<script lang="ts">
  import { t } from "#lib/i18n";
  import ExportOptionsModal, { type ExportOption } from "#lib/components/export/ExportOptionsModal.svelte";
  import { exportExerciseGroups } from "#lib/export/exerciseExport";
  import type { ExerciseGroup } from "#lib/exercise-library/groupExercises";

  /** One group: choose assets/PDFs. The whole library: fixed contents (global assets, no PDFs). */
  interface Props {
    groups: ExerciseGroup[];
    library?: boolean;
    onClose: () => void;
  }

  let { groups, library = false, onClose }: Props = $props();

  let options: ExportOption[] = $derived(library
    ? []
    : [
        { key: "globalAssets", label: $t("export.exercises.globalAssets"), hint: $t("export.exercises.globalAssetsHint") },
        { key: "pdfs", label: $t("export.exercises.pdfs"), hint: $t("export.exercises.pdfsHint"), checked: false },
      ]);
</script>

<ExportOptionsModal
  title={library ? $t("export.exercises.libraryTitle") : $t("export.exercises.groupTitle", { name: groups[0]?.name ?? "" })}
  {options}
  {onClose}
  run={(selected, progress) =>
    exportExerciseGroups(groups, { globalAssets: library || selected.has("globalAssets"), pdfs: selected.has("pdfs") }, progress)}
>
  {#snippet notice()}
    {#if library}<p class="mb-4 text-sm text-muted">{$t("export.exercises.libraryNotice")}</p>{/if}
  {/snippet}
</ExportOptionsModal>
