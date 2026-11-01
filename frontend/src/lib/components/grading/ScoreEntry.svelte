<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import ScoreRow from "./ScoreRow.svelte";
  import { exerciseParts, hasPartValues, partOverrideKey, REST_KEY, restMax } from "#lib/grading/partScores";
  import { LinkButton } from "#lib/components/ui";

  interface Props {
    exercises: ExerciseRecord[];
    /** An exercise was edited from its label (points may have changed). */
    onExerciseSaved?: () => void;
  }

  let { exercises, onExerciseSaved }: Props = $props();

  function isTarget(ex: ExerciseRecord, label: string): boolean {
    return $gradingStore.activeExerciseId === ex.id && $gradingStore.activePartLabel === label;
  }

  function setTotal(ex: ExerciseRecord, value: number | null) {
    gradingStore.setManualOverrideFlag(ex.id, true);
    gradingStore.setScoreInput(ex.id, value);
  }

  function setPart(ex: ExerciseRecord, key: string, value: number | null) {
    gradingStore.setManualOverrideFlag(partOverrideKey(ex.id, key), true);
    gradingStore.setPartInput(ex, key, value);
  }

  function resetPart(ex: ExerciseRecord, key: string) {
    gradingStore.setPartInput(ex, key, null);
    gradingStore.setManualOverrideFlag(partOverrideKey(ex.id, key), false);
  }

  /** Clears the exercise with all of its parts. */
  function resetExercise(ex: ExerciseRecord) {
    const state = gradingStore.getState();
    const { [ex.id]: _dropped, ...partInputs } = state.partInputs;
    const prefix = partOverrideKey(ex.id, "");
    gradingStore.setPartInputs(partInputs);
    gradingStore.setManualOverride(Object.fromEntries(Object.entries(state.manualOverride).filter(([k]) => !k.startsWith(prefix))));
    gradingStore.setScoreInput(ex.id, null);
    gradingStore.setManualOverrideFlag(ex.id, false);
  }

  /** The points-outside-the-parts row: shown while grading part by part when the exercise has such points or stamps landed there. */
  function showRest(ex: ExerciseRecord): boolean {
    const parts = $gradingStore.partInputs[ex.id];
    return hasPartValues(parts) && (restMax(ex) > 0 || parts?.[REST_KEY] != null);
  }

  let editEx: ExerciseRecord | null = $state.raw(null);
</script>

<div class="shrink-0 border-b border-line bg-surface-raised px-3 py-2.5">
  <h3 class="m-0 text-sm font-semibold text-content">{$t("grading.scoreEntry.title", { count: exercises.length })}</h3>
  <span class="text-xs text-muted">{$t("grading.scoreEntry.hint")}</span>
</div>

<div class="flex flex-1 min-h-0 flex-col gap-1.5 overflow-y-auto p-2">
  {#each exercises as ex (ex.id)}
    {@const parts = $gradingStore.partInputs[ex.id]}
    <ScoreRow
      value={$gradingStore.scoreInputs[ex.id]}
      max={ex.maxPoints}
      active={isTarget(ex, "")}
      manual={!!$gradingStore.manualOverride[ex.id] && !hasPartValues(parts)}
      readonlyReason={hasPartValues(parts) ? $t("grading.scoreEntry.sumOfParts") : undefined}
      inputId={`score-${ex.id}`}
      onSelect={() => gradingStore.setActivePart(ex.id, "")}
      onValue={(v) => setTotal(ex, v)}
      onReset={() => resetExercise(ex)}
    >
      {#snippet label()}
        <LinkButton onClick={() => (editEx = ex)} class="text-xs font-bold text-content!">Q{ex.orderIndex}{#if ex.subIndex}&nbsp;{String.fromCharCode(96 + ex.subIndex)}){/if}</LinkButton>
      {/snippet}
    </ScoreRow>
    {#each exerciseParts(ex) as part (part.label)}
      <ScoreRow
        nested
        value={parts?.[part.label]}
        max={part.max}
        active={isTarget(ex, part.label)}
        manual={!!$gradingStore.manualOverride[partOverrideKey(ex.id, part.label)]}
        ariaLabel={$t("grading.scoreEntry.partRowLabel", { label: part.label })}
        onSelect={() => gradingStore.setActivePart(ex.id, part.label)}
        onValue={(v) => setPart(ex, part.label, v)}
        onReset={() => resetPart(ex, part.label)}
      >
        {#snippet label()}<span class="font-semibold text-content">{$t("grading.scoreEntry.partRowLabel", { label: part.label })}</span>{/snippet}
      </ScoreRow>
    {/each}
    {#if showRest(ex)}
      {@const rest = parts?.[REST_KEY]}
      <ScoreRow
        nested
        value={rest}
        max={ex.maxPoints}
        maxLabel={restMax(ex)}
        active={false}
        manual={!!$gradingStore.manualOverride[partOverrideKey(ex.id, REST_KEY)]}
        warning={rest != null && rest > restMax(ex) ? $t("grading.scoreEntry.restOverMax", { max: restMax(ex) }) : undefined}
        ariaLabel={$t("grading.scoreEntry.restRowLabel")}
        onSelect={() => gradingStore.setActivePart(ex.id, "")}
        onValue={(v) => setPart(ex, REST_KEY, v)}
        onReset={() => resetPart(ex, REST_KEY)}
      >
        {#snippet label()}<span class="font-semibold text-content">{$t("grading.scoreEntry.restRowLabel")}</span>{/snippet}
      </ScoreRow>
    {/if}
  {/each}
</div>

{#if editEx}
  <ExerciseEditorModal isOpen editingExercise={editEx} onClose={() => (editEx = null)} onSave={() => onExerciseSaved?.()} />
{/if}
