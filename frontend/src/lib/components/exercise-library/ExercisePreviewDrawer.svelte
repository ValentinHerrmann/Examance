<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
  import LatexViewer from "$lib/components/LatexViewer.svelte";
  import { t } from "$lib/i18n";
  import { Modal, Button } from "$lib/components/ui";

  export let previewModalEx: ExerciseRecord;
  export let isModalSelected: boolean;
  export let onClose: () => void;
  export let onToggleSelection: (id: string) => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;

  $: modalScore = parseExerciseScore(previewModalEx.latexBody || "") || previewModalEx.maxPoints || 0;
</script>

<Modal open={true} size="md" onClose={onClose}>
  <svelte:fragment slot="header">
    <div class="min-w-0">
      <div class="mb-[0.4rem] flex items-center gap-2">
        <h3 class="m-0 truncate text-[1.15rem] text-content">{previewModalEx.name}</h3>
        {#if previewModalEx.variantKey && previewModalEx.variantKey !== "_General"}
          <span class="rounded bg-surface-inset px-[0.4rem] py-[0.1rem] text-xs text-muted">{previewModalEx.variantKey}</span>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-[0.4rem]">
        {#if previewModalEx.topicTag}
          <span class="rounded bg-surface-inset px-[0.4rem] py-[0.1rem] text-xs text-muted">{previewModalEx.topicTag}</span>
        {/if}
        <span class="rounded bg-sky-700 px-2 py-[0.15rem] text-xs font-semibold text-sky-100">{$t("exercises.previewDrawer.pointsBadge", { score: modalScore })}</span>
        <span class="rounded bg-surface-inset px-2 py-[0.15rem] text-xs text-muted"
          >{$t("exercises.previewDrawer.versionBadge", { version: previewModalEx.version })}</span
        >
        {#if previewModalEx.questionType}
          <span class="rounded bg-line-strong px-2 py-[0.15rem] text-xs uppercase text-content"
            >{previewModalEx.questionType}</span
          >
        {/if}
      </div>
    </div>
  </svelte:fragment>

  <div class="flex flex-col gap-[0.4rem]">
    <div class="text-[0.78rem] font-semibold uppercase tracking-[0.05em] text-muted">{$t("exercises.previewDrawer.latexSourceCodeLabel")}</div>
    <LatexViewer code={previewModalEx.latexBody || "\\begin{Aufgabe}{}\n\\end{Aufgabe}"} maxHeight="350px" />
  </div>

  <svelte:fragment slot="footer">
    <Button
      variant={isModalSelected ? "primary" : "secondary"}
      onClick={() => onToggleSelection(previewModalEx.id)}
      class="mr-auto"
    >
      {isModalSelected
        ? $t("exercises.previewDrawer.selectedButton")
        : $t("exercises.previewDrawer.selectButton")}
    </Button>
    <Button variant="secondary" onClick={() => onQuickEdit(previewModalEx)}>
      {$t("exercises.previewDrawer.quickEditButton")}
    </Button>
    <Button variant="ghost" onClick={onClose}>
      {$t("common.close")}
    </Button>
  </svelte:fragment>
</Modal>
