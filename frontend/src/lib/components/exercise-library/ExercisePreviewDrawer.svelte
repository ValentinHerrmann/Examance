<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import LatexViewer from "#lib/components/LatexViewer.svelte";
  import { t } from "#lib/i18n";
  import { faCheck } from "@fortawesome/free-solid-svg-icons";
  import { Modal, Button, Badge } from "#lib/components/ui";

  interface Props {
    previewModalEx: ExerciseRecord;
    isModalSelected: boolean;
    onClose: () => void;
    onToggleSelection: (id: string) => void;
    onQuickEdit: (ex: ExerciseRecord) => void;
  }

  let {
    previewModalEx,
    isModalSelected,
    onClose,
    onToggleSelection,
    onQuickEdit
  }: Props = $props();

  let modalScore = $derived(parseExerciseScore(previewModalEx.latexBody || "") || previewModalEx.maxPoints || 0);
</script>

<Modal open={true} size="large" onClose={onClose}>
  {#snippet header()}
    <div class="min-w-0">
      <div class="mb-1.5 flex items-center gap-2">
        <h2 class="m-0 truncate text-xl font-semibold text-content">{previewModalEx.name}</h2>
        {#if previewModalEx.variantKey && previewModalEx.variantKey !== "_General"}
          <Badge>{previewModalEx.variantKey}</Badge>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        {#if previewModalEx.topicTag}
          <Badge>{previewModalEx.topicTag}</Badge>
        {/if}
        <Badge severity="primary">{$t("exercises.previewDrawer.pointsBadge", { score: modalScore })}</Badge>
        <Badge>{$t("exercises.previewDrawer.versionBadge", { version: previewModalEx.version })}</Badge>
        {#if previewModalEx.questionType}
          <Badge severity="contrast">{previewModalEx.questionType}</Badge>
        {/if}
      </div>
    </div>
  {/snippet}

  <div class="flex flex-col gap-1.5">
    <h3 class="m-0 text-sm font-semibold text-muted">{$t("exercises.previewDrawer.latexSourceCodeLabel")}</h3>
    <LatexViewer code={previewModalEx.latexBody || "\\begin{Aufgabe}{}\n\\end{Aufgabe}"} maxHeight="350px" />
  </div>

  {#snippet footer()}
    <Button
      variant={isModalSelected ? "solid" : "outlined"}
      severity={isModalSelected ? "primary" : "secondary"}
      icon={isModalSelected ? faCheck : undefined}
      onClick={() => onToggleSelection(previewModalEx.id)}
      class="mr-auto"
    >
      {isModalSelected
        ? $t("exercises.previewDrawer.selectedButton")
        : $t("exercises.previewDrawer.selectButton")}
    </Button>
    <Button variant="outlined" severity="secondary" onClick={() => onQuickEdit(previewModalEx)}>
      {$t("exercises.previewDrawer.quickEditButton")}
    </Button>
    <Button variant="text" severity="secondary" onClick={onClose}>
      {$t("common.close")}
    </Button>
  {/snippet}
</Modal>
