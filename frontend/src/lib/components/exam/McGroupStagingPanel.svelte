<script lang="ts">
  import { untrack } from "svelte";
  import type { ExerciseRecord } from "$lib/db/schema";
  import type { McGroupDraft } from "$lib/exam/mcGroupStaging";
  import { canFinalizeGroup } from "$lib/exam/mcGroupStaging";
  import { mcSubLabel } from "$lib/grading/mcGroupLabels";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ExerciseLabel from "$lib/components/exam/ExerciseLabel.svelte";
  import { faArrowUp, faArrowDown } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Button, Field, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  interface Props {
    /** Staged questions, in group order. */
    stagedExercises: ExerciseRecord[];
    /** The group being edited, or null when building a new one. */
    editingGroup?: McGroupDraft | null;
    onRemove: (exerciseId: string) => void;
    onReorder: (index: number, direction: "up" | "down") => void;
    onFinalize: (title: string, scoringText: string) => void;
  }

  let {
    stagedExercises,
    editingGroup = null,
    onRemove,
    onReorder,
    onFinalize
  }: Props = $props();

  // Default group title and scoring sentence are exam CONTENT printed verbatim in
  // the German exam PDF (see i18n brief "Do NOT translate") — not UI strings.
  const DEFAULT_TITLE = "Grundlagen";
  const DEFAULT_SCORING_TEXT =
    "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. Pro Teilaufgabe aber immer $\\geq$0BE";

  let title = $state(DEFAULT_TITLE);
  let scoringText = $state(DEFAULT_SCORING_TEXT);
  /** Confirmation after a group was added/updated, so it is clear another one can follow. */
  let notice = $state("");

  // Prefill from the group being edited; reset when switching back to "new".
  let loadedGroupId: string | null = null;

  let count = $derived(stagedExercises.length);

  function finalize() {
    notice = editingGroup
      ? $t("exam.mcStagingPanel.updatedNotice", { title })
      : $t("exam.mcStagingPanel.addedNotice", { title });
    onFinalize(title, scoringText);
    title = DEFAULT_TITLE;
  }

  $effect.pre(() => {
    const group = editingGroup;
    const groupId = group?.id ?? null;
    untrack(() => {
      if (groupId !== loadedGroupId) {
        loadedGroupId = groupId;
        title = group?.title ?? DEFAULT_TITLE;
        scoringText = group?.scoringText ?? DEFAULT_SCORING_TEXT;
      }
    });
  });

  $effect.pre(() => {
    if (stagedExercises.length > 0) untrack(() => (notice = ""));
  });
</script>

<div class="flex min-w-0 flex-col gap-3 rounded-md border border-warning/60 bg-warning/5 p-4">
  <h3 class="m-0 text-base font-semibold text-content">
    {editingGroup
      ? $t("exam.mcStagingPanel.headingEdit", { count })
      : $t("exam.mcStagingPanel.headingNew", { count })}
  </h3>

  {#if notice}
    <Alert severity="success">{notice}</Alert>
  {/if}

  {#if count === 0}
    <p class="m-0 text-xs text-muted">{$t("exam.mcStagingPanel.emptyHint")}</p>
  {:else}
    <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
      {#each stagedExercises as ex, i (ex.id)}
        <li class="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-sunken px-2.5 py-1.5 text-sm text-content">
          <span class="flex min-w-0 items-center gap-1"><span class="shrink-0">{mcSubLabel(i, count)})</span> <ExerciseLabel exercise={ex} /></span>
          <div class="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp} ariaLabel={$t("exam.mcStagingPanel.moveUp")} title={$t("exam.mcStagingPanel.moveUp")} disabled={i === 0} onClick={() => onReorder(i, "up")} />
            <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown} ariaLabel={$t("exam.mcStagingPanel.moveDown")} title={$t("exam.mcStagingPanel.moveDown")} disabled={i === count - 1} onClick={() => onReorder(i, "down")} />
            <Button size="sm" variant="text" severity="danger" onClick={() => onRemove(ex.id)}>{$t("exam.mcStagingPanel.remove")}</Button>
          </div>
        </li>
      {/each}
    </ul>

    <div class="flex flex-col gap-2.5">
      <Field label={$t("exam.mcStagingPanel.titleLabel")} forId="mc-group-title">
        <TextInput id="mc-group-title" bind:value={title} />
      </Field>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-content">{$t("exam.mcStagingPanel.scoringLabel")}</span>
        <LatexEditor bind:value={scoringText} rows={3} />
      </div>
      <Button
        size="sm"
        variant="outlined"
        class="self-start"
        disabled={!canFinalizeGroup(stagedExercises.map((ex) => ex.id))}
        onClick={finalize}
      >
        {editingGroup
          ? $t("exam.mcStagingPanel.updateButton", { count })
          : $t("exam.mcStagingPanel.addButton", { count })}
      </Button>
    </div>
  {/if}
</div>
