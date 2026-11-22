<script lang="ts">
  import type { ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { isMcQuestion } from "#lib/grading/mcScore";
  import { t } from "#lib/i18n";
  import { untrack } from "svelte";
  import { safeLocalStorage } from "#lib/utils/storage";
  import { minWidth } from "#lib/stores/viewport";
  import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "#lib/components/ui";
  import GradeSummaryCard from "./GradeSummaryCard.svelte";
  import ScoreEntry from "./ScoreEntry.svelte";
  import McAnswerReview from "./McAnswerReview.svelte";
  import ReviewReplyBar from "./ReviewReplyBar.svelte";
  import ExerciseStepper from "./ExerciseStepper.svelte";

  /** The grading view's score card (issue #330): floating beside the toolbox from `md`, a bottom sheet on phones; collapses to its summary and the current target's score. */
  interface Props {
    examId: string;
    exercises: ExerciseRecord[];
    currentSub: SubmissionRecord | undefined;
    isFullyGraded: boolean;
    sumGradedScores: number;
    gradedCount: number;
    totalMaxPoints: number;
    gradedMaxPoints: number;
    gradeDetail: GradeDetail | null;
    /** Steps to the previous or next stamp target (issue #330). */
    onStep: (dir: 1 | -1) => void;
    atFirstStudent: boolean;
    onFlush: () => Promise<void>;
    /** Whether only the summary and the current target show; bindable so the scan can use the room. */
    collapsed?: boolean;
    class?: string;
  }

  let { examId, exercises, currentSub, isFullyGraded, sumGradedScores, gradedCount, totalMaxPoints, gradedMaxPoints, gradeDetail, onStep, atFirstStudent, onFlush, collapsed = $bindable(false), class: className = "" }: Props = $props();

  const KEY = "grading_score_card_collapsed";
  const wide = minWidth("md");
  // Remembered per browser; without a choice the card starts open beside the scan and closed as a phone sheet.
  let stored = $state(safeLocalStorage.getItem(KEY));

  function toggle() {
    stored = collapsed ? "0" : "1";
    safeLocalStorage.setItem(KEY, stored);
  }

  let activeExercise = $derived(exercises.find((e) => e.id === $gradingStore.activeExerciseId));

  $effect.pre(() => {
    const next = stored === null ? !$wide : stored === "1";
    untrack(() => (collapsed = next));
  });
</script>

<section
  class="z-30 flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-md border border-line bg-surface-raised
    md:w-52 md:self-start md:shadow-md {collapsed ? '' : 'h-[70dvh] md:h-auto md:max-h-full'} {className}"
  aria-label={$t("grading.workspace.scorePanel")}
>
  <div class="shrink-0 border-b border-line py-1.5 pr-1 pl-2">
    <GradeSummaryCard {isFullyGraded} {sumGradedScores} {gradedCount} exercisesLength={exercises.length} {totalMaxPoints} {gradedMaxPoints} {gradeDetail}>
      {#snippet end()}
        <!-- Points down while folded ("open"), up while open ("fold"). -->
        <Button
          size="sm"
          variant="text"
          severity="secondary"
          iconOnly
          icon={collapsed ? faChevronDown : faChevronUp}
          aria-expanded={!collapsed}
          onClick={toggle}
          title={collapsed ? $t("grading.workspace.expandScores") : $t("grading.workspace.collapseScores")}
          ariaLabel={$t("grading.workspace.scorePanel")}
        />
      {/snippet}
    </GradeSummaryCard>
  </div>

  {#if !collapsed}
    <ScoreEntry {exercises} {onStep} />
    {#if activeExercise && isMcQuestion(activeExercise)}
      <McAnswerReview exercise={activeExercise} />
    {/if}
  {/if}

  <div class="flex shrink-0 flex-col gap-1.5 px-1 py-1 {collapsed ? '' : 'border-t border-line'}">
    <ExerciseStepper {exercises} {onStep} {atFirstStudent} withInput={collapsed} />
    <ReviewReplyBar {examId} sub={currentSub} {exercises} {onFlush} />
  </div>
</section>
