<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import ScoreRow from "./ScoreRow.svelte";
  import { exerciseParts, hasPartValues, partOverrideKey, REST_KEY, restMax } from "#lib/grading/partScores";
  import { exerciseTag, resetExercise, resetPart, setPart, setTotal } from "#lib/grading/scoreEdits";

  interface Props {
    exercises: ExerciseRecord[];
  }

  let { exercises }: Props = $props();

  function isTarget(ex: ExerciseRecord, label: string): boolean {
    return $gradingStore.activeExerciseId === ex.id && $gradingStore.activePartLabel === label;
  }

  /** The points-outside-the-parts row: shown while grading part by part when the exercise has such points or stamps landed there. */
  function showRest(ex: ExerciseRecord): boolean {
    const parts = $gradingStore.partInputs[ex.id];
    return hasPartValues(parts) && (restMax(ex) > 0 || parts?.[REST_KEY] != null);
  }
</script>

<!-- One flat list: hairlines between rows, a stronger line between exercises; no gaps or frames that cost width (issue #328). The card header carries the totals, so no title row (issue #330). -->
<div class="flex min-h-0 flex-1 flex-col divide-y divide-line-strong overflow-y-auto" role="group" aria-label={$t("grading.scoreEntry.title", { count: exercises.length })}>
  {#each exercises as ex (ex.id)}
    {@const parts = $gradingStore.partInputs[ex.id]}
    <div class="divide-y divide-line">
    <ScoreRow
      value={$gradingStore.scoreInputs[ex.id]}
      max={ex.maxPoints}
      active={isTarget(ex, "")}
      manual={!!$gradingStore.manualOverride[ex.id] && !hasPartValues(parts)}
      readonlyReason={hasPartValues(parts) ? $t("grading.scoreEntry.sumOfParts") : undefined}
      inputId={`score-${ex.id}`}
      reviewKey={ex.id}
      onSelect={() => gradingStore.setActivePart(ex.id, "")}
      onValue={(v) => setTotal(ex, v)}
      onReset={() => resetExercise(ex)}
    >
      {#snippet label()}
        <!-- Plain text, no link to the exercise editor: a pen or palm tapped it by accident while grading (issue #233). -->
        <span class="text-sm font-bold text-content">{exerciseTag(ex)}</span>
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
        reviewKey={partOverrideKey(ex.id, part.label)}
        onSelect={() => gradingStore.setActivePart(ex.id, part.label)}
        onValue={(v) => setPart(ex, part.label, v)}
        onReset={() => resetPart(ex, part.label)}
      >
        {#snippet label()}<span class="sr-only">{$t("grading.scoreEntry.partRowLabel", { label: part.label })}</span><span class="font-semibold text-content" aria-hidden="true">{part.label})</span>{/snippet}
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
    </div>
  {/each}
</div>
