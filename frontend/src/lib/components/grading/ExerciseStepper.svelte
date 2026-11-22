<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { gradingTargets, targetIndex, targetTag as tag, type GradingTarget } from "#lib/grading/gradingTargets";
  import { resetExercise, resetPart, setPart, setTotal } from "#lib/grading/scoreEdits";
  import { partOverrideKey } from "#lib/grading/partScores";
  import { t } from "#lib/i18n";
  import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "#lib/components/ui";
  import ScoreRow from "./ScoreRow.svelte";

  /** Previous/next stamp target of the score card (issue #330): chevrons, unlike the header's outlined student arrows and the card's fold chevron at the top. */
  interface Props {
    exercises: ExerciseRecord[];
    onStep: (dir: 1 | -1) => void;
    /** Shows the target's score field (the collapsed card); otherwise only its name, the field is in the list. */
    withInput?: boolean;
    /** The first student: stepping back from the first target goes nowhere. */
    atFirstStudent?: boolean;
  }

  let { exercises, onStep, withInput = false, atFirstStudent = false }: Props = $props();

  let targets = $derived(gradingTargets(exercises));
  let index = $derived(targetIndex(targets, $gradingStore.activeExerciseId, $gradingStore.activePartLabel));
  let target: GradingTarget | undefined = $derived(targets[index]);

  function value(tg: GradingTarget): number | null | undefined {
    return tg.partKey === null ? $gradingStore.scoreInputs[tg.exercise.id] : $gradingStore.partInputs[tg.exercise.id]?.[tg.partKey];
  }

  function manual(tg: GradingTarget): boolean {
    return !!$gradingStore.manualOverride[tg.partKey === null ? tg.exercise.id : partOverrideKey(tg.exercise.id, tg.partKey)];
  }

  function onValue(tg: GradingTarget, v: number | null) {
    if (tg.partKey === null) setTotal(tg.exercise, v);
    else setPart(tg.exercise, tg.partKey, v);
  }

  function onReset(tg: GradingTarget) {
    if (tg.partKey === null) resetExercise(tg.exercise);
    else resetPart(tg.exercise, tg.partKey);
  }
</script>

<div class="flex min-w-0 items-center gap-0.5" role="group" aria-label={$t("grading.stepper.label")}>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    iconOnly
    icon={faChevronLeft}
    disabled={atFirstStudent && index <= 0}
    onClick={() => onStep(-1)}
    title={$t("grading.stepper.prev")}
    ariaLabel={$t("grading.stepper.prev")}
  />
  <div class="min-w-0 flex-1">
    {#if target && withInput}
      <ScoreRow
        value={value(target)}
        max={target.max}
        active={false}
        manual={manual(target)}
        inputId="score-stepper"
        compact
        ariaLabel={tag(target)}
        onEnter={() => onStep(1)}
        onSelect={() => {}}
        onValue={(v) => onValue(target!, v)}
        onReset={() => onReset(target!)}
      >
        {#snippet label()}<span class="text-sm font-bold text-content">{tag(target!)}</span>{/snippet}
      </ScoreRow>
    {:else if target}
      <span class="block truncate text-center text-sm font-bold text-content" title={$t("grading.scoreEntry.stampTarget")}>{tag(target)}</span>
    {/if}
  </div>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    iconOnly
    icon={faChevronRight}
    onClick={() => onStep(1)}
    title={$t("grading.stepper.next")}
    ariaLabel={$t("grading.stepper.next")}
  />
</div>
