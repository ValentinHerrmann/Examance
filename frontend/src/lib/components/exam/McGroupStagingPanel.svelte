<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import type { McGroupDraft } from "$lib/exam/mcGroupStaging";
  import { canFinalizeGroup } from "$lib/exam/mcGroupStaging";
  import { mcSubLabel } from "$lib/grading/mcGroupLabels";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ExerciseLabel from "$lib/components/exam/ExerciseLabel.svelte";
  import { TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  /** Staged questions, in group order. */
  export let stagedExercises: ExerciseRecord[];
  /** The group being edited, or null when building a new one. */
  export let editingGroup: McGroupDraft | null = null;
  export let onRemove: (exerciseId: string) => void;
  export let onReorder: (index: number, direction: "up" | "down") => void;
  export let onFinalize: (title: string, scoringText: string) => void;

  // Default group title and scoring sentence are exam CONTENT printed verbatim in
  // the German exam PDF (see i18n brief "Do NOT translate") — not UI strings.
  const DEFAULT_TITLE = "Grundlagen";
  const DEFAULT_SCORING_TEXT =
    "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. Pro Teilaufgabe aber immer $\\geq$0BE";

  let title = DEFAULT_TITLE;
  let scoringText = DEFAULT_SCORING_TEXT;
  /** Confirmation after a group was added/updated, so it is clear another one can follow. */
  let notice = "";

  // Prefill from the group being edited; reset when switching back to "new".
  let loadedGroupId: string | null = null;
  $: if ((editingGroup?.id ?? null) !== loadedGroupId) {
    loadedGroupId = editingGroup?.id ?? null;
    title = editingGroup?.title ?? DEFAULT_TITLE;
    scoringText = editingGroup?.scoringText ?? DEFAULT_SCORING_TEXT;
  }

  $: if (stagedExercises.length > 0) notice = "";
  $: count = stagedExercises.length;

  function finalize() {
    notice = editingGroup
      ? $t("exam.mcStagingPanel.updatedNotice", { title })
      : $t("exam.mcStagingPanel.addedNotice", { title });
    onFinalize(title, scoringText);
    title = DEFAULT_TITLE;
  }

  const iconBtn =
    "cursor-pointer border-none bg-transparent px-1 text-muted hover:text-content disabled:cursor-not-allowed disabled:opacity-40";
</script>

<div class="flex min-w-0 flex-col gap-3 rounded-xl border border-warning/60 bg-warning/5 p-4">
  <h4 class="m-0 text-sm font-semibold text-warning-fg">
    {editingGroup
      ? $t("exam.mcStagingPanel.headingEdit", { count })
      : $t("exam.mcStagingPanel.headingNew", { count })}
  </h4>

  {#if notice}
    <p class="m-0 rounded-md border border-success/50 bg-success/10 px-3 py-2 text-xs text-success-fg" role="status">
      {notice}
    </p>
  {/if}

  {#if count === 0}
    <p class="m-0 text-xs text-muted">{$t("exam.mcStagingPanel.emptyHint")}</p>
  {:else}
    <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
      {#each stagedExercises as ex, i (ex.id)}
        <li class="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-base/60 px-2.5 py-1.5 text-sm text-content/90">
          <span class="flex min-w-0 items-center gap-1"><span class="shrink-0">{mcSubLabel(i, count)})</span> <ExerciseLabel exercise={ex} /></span>
          <div class="flex shrink-0 items-center gap-1.5">
            <button type="button" class={iconBtn} disabled={i === 0} on:click={() => onReorder(i, "up")} title={$t("exam.mcStagingPanel.moveUp")}>↑</button>
            <button type="button" class={iconBtn} disabled={i === count - 1} on:click={() => onReorder(i, "down")} title={$t("exam.mcStagingPanel.moveDown")}>↓</button>
            <button type="button" class="cursor-pointer border-none bg-transparent text-xs text-danger-fg hover:text-danger-fg" on:click={() => onRemove(ex.id)}>
              {$t("exam.mcStagingPanel.remove")}
            </button>
          </div>
        </li>
      {/each}
    </ul>

    <div class="flex flex-col gap-2.5">
      <div>
        <label class="mb-0.5 block text-xs font-medium text-muted" for="mc-group-title">{$t("exam.mcStagingPanel.titleLabel")}</label>
        <TextInput id="mc-group-title" bind:value={title} />
      </div>
      <div>
        <span class="mb-0.5 block text-xs font-medium text-muted">{$t("exam.mcStagingPanel.scoringLabel")}</span>
        <LatexEditor bind:value={scoringText} rows={3} />
      </div>
      <button
        type="button"
        class="cursor-pointer self-start rounded-md border border-warning bg-warning/15 px-3 py-1.5 text-sm font-semibold text-warning-fg transition-colors enabled:hover:bg-warning/25 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canFinalizeGroup(stagedExercises.map((ex) => ex.id))}
        on:click={finalize}
      >
        {editingGroup
          ? $t("exam.mcStagingPanel.updateButton", { count })
          : $t("exam.mcStagingPanel.addButton", { count })}
      </button>
    </div>
  {/if}
</div>
