<script lang="ts">
  import type { ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import type { AutosaveStatus } from "#lib/utils/autosave";
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
  import GradingActions from "./GradingActions.svelte";

  /** The grading view's score card (issue #330): floating beside the toolbox from `md`, a bottom sheet on phones; collapses to its summary and the arrows. */
  interface Props {
    examId: string;
    exercises: ExerciseRecord[];
    currentSub: SubmissionRecord | undefined;
    currentIndex: number;
    isFullyGraded: boolean;
    sumGradedScores: number;
    gradedCount: number;
    totalMaxPoints: number;
    gradeDetail: GradeDetail | null;
    saveStatus: AutosaveStatus;
    onPrev: () => void;
    onNext: () => void;
    onFlush: () => Promise<void>;
    /** Whether only the summary and the arrows show; bindable so the scan can use the room. */
    collapsed?: boolean;
    class?: string;
  }

  let { examId, exercises, currentSub, currentIndex, isFullyGraded, sumGradedScores, gradedCount, totalMaxPoints, gradeDetail, saveStatus, onPrev, onNext, onFlush, collapsed = $bindable(false), class: className = "" }: Props = $props();

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
  <div class="flex shrink-0 items-start gap-1 border-b border-line px-2 py-1.5">
    <div class="min-w-0 flex-1">
      <GradeSummaryCard {isFullyGraded} {sumGradedScores} {gradedCount} exercisesLength={exercises.length} {totalMaxPoints} {gradeDetail} />
    </div>
    <Button
      size="sm"
      variant="text"
      severity="secondary"
      iconOnly
      icon={collapsed ? faChevronUp : faChevronDown}
      aria-expanded={!collapsed}
      onClick={toggle}
      title={collapsed ? $t("grading.workspace.expandScores") : $t("grading.workspace.collapseScores")}
      ariaLabel={$t("grading.workspace.scorePanel")}
    />
  </div>

  {#if !collapsed}
    <ScoreEntry {exercises} />
    {#if activeExercise && isMcQuestion(activeExercise)}
      <McAnswerReview exercise={activeExercise} />
    {/if}
    {#if gradeDetail}
      <div class="shrink-0 border-t border-line px-2 py-1">
        <GradeSummaryCard {isFullyGraded} {sumGradedScores} {gradedCount} exercisesLength={exercises.length} {totalMaxPoints} {gradeDetail} hints summary={false} />
      </div>
    {/if}
  {/if}

  <div class="flex shrink-0 flex-col gap-1.5 border-t border-line px-2 py-1.5">
    <ReviewReplyBar {examId} sub={currentSub} {exercises} {onFlush} />
    <GradingActions {saveStatus} {onPrev} {onNext} {currentIndex} />
  </div>
</section>
