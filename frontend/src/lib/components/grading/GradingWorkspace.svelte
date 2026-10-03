<script lang="ts">
  import type { ExamRecord, ExerciseRecord, SubmissionRecord } from "$lib/db/schema";
  import type { GradeDetail } from "$lib/analytics/gradingKey";
  import { gradingStore } from "$lib/grading/gradingStore";
  import { isMcQuestion } from "$lib/grading/mcScore";
  import GradingHeader from "./GradingHeader.svelte";
  import GradeSummaryCard from "./GradeSummaryCard.svelte";
  import ZoomPageControls from "./ZoomPageControls.svelte";
  import AnnotationToolbar from "./AnnotationToolbar.svelte";
  import ScoreEntry from "./ScoreEntry.svelte";
  import McAnswerReview from "./McAnswerReview.svelte";
  import ClearAnnotationsModal from "./ClearAnnotationsModal.svelte";
  import LastSubmissionModal from "./LastSubmissionModal.svelte";
  import GradingActions from "./GradingActions.svelte";
  import ScanCanvasViewer from "./ScanCanvasViewer.svelte";
  import { t } from "$lib/i18n";
  import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "$lib/components/ui";

  interface Props {
    examId: string;
    exam: ExamRecord | null;
    submissions: SubmissionRecord[];
    exercises: ExerciseRecord[];
    currentIndex: number;
    currentSub: SubmissionRecord | undefined;
    calculatedGrade: { grade: string; label: string } | null;
    calculatedGradeDetail: GradeDetail | null;
    isFullyGraded: boolean;
    totalScore: number | undefined;
    sumGradedScores: number;
    gradedCount: number;
    totalMaxPoints: number;
    onSubmissionHydrated: (fullSub: SubmissionRecord) => void;
    onSave: () => void;
    onPrev: () => void;
    onNext: () => void;
    onStayOnLastSub: () => void;
  }

  let {
    examId,
    exam,
    submissions,
    exercises,
    currentIndex,
    currentSub,
    calculatedGrade,
    calculatedGradeDetail,
    isFullyGraded,
    totalScore,
    sumGradedScores,
    gradedCount,
    totalMaxPoints,
    onSubmissionHydrated,
    onSave,
    onPrev,
    onNext,
    onStayOnLastSub
  }: Props = $props();

  let viewerRef: ReturnType<typeof ScanCanvasViewer> | undefined = $state();

  // Below `lg` the score panel is a bottom sheet (a fixed column left the scan ~70px on phones);
  // collapsed it shows summary + navigation, expanded it takes the screen for score entry.
  let isScorePanelExpanded = $state(false);

  let activeExercise = $derived(exercises.find((e) => e.id === $gradingStore.activeExerciseId));

  function requestClearAnnotations() {
    gradingStore.setShowClearConfirmModal(true);
  }

  function cancelClearAnnotations() {
    gradingStore.setShowClearConfirmModal(false);
  }
</script>

<GradingHeader
  {examId}
  {exam}
  {currentIndex}
  submissionsLength={submissions.length}
  {currentSub}
  {calculatedGrade}
/>

<!-- `flex-1 min-h-0` rather than a viewport-height magic number: the grade
     page root is a flex column that fills the space above the footer, and the
     old value broke as soon as the header wrapped to a second line. -->
<div
  class="box-border grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden p-2
    lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1"
>
  <div class="relative flex min-h-0 w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-md border border-line bg-surface-sunken lg:h-full lg:gap-0">
    <AnnotationToolbar onClearRequested={requestClearAnnotations} />

    <ScanCanvasViewer
      bind:this={viewerRef}
      {examId}
      submission={currentSub}
      {exercises}
      {onSubmissionHydrated}
    />

    <ZoomPageControls
      onPagePrev={() => viewerRef?.goPagePrev()}
      onPageNext={() => viewerRef?.goPageNext()}
      onToggleAutoCrop={() => viewerRef?.toggleAutoCrop()}
      onZoomOut={() => viewerRef?.zoomOut()}
      onZoomIn={() => viewerRef?.zoomIn()}
      onResetZoom={() => viewerRef?.resetZoom()}
    />
  </div>

  <div
    class="box-border flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-surface-sunken
      {isScorePanelExpanded ? 'h-[70dvh]' : ''} lg:h-full"
  >
    <Button
      variant="text"
      severity="secondary"
      class="w-full justify-between rounded-none border-b-line bg-surface-inset font-semibold lg:hidden"
      aria-expanded={isScorePanelExpanded}
      iconRight={isScorePanelExpanded ? faChevronDown : faChevronUp}
      onClick={() => (isScorePanelExpanded = !isScorePanelExpanded)}
    >
      {$t("grading.workspace.scorePanel")}
    </Button>

    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden {isScorePanelExpanded
        ? ''
        : 'hidden'} lg:flex"
    >
      <ScoreEntry {exercises} />

      {#if activeExercise && isMcQuestion(activeExercise)}
        <McAnswerReview exercise={activeExercise} />
      {/if}
    </div>

    <div class="flex shrink-0 flex-col gap-2 border-t border-line bg-surface-raised px-3 py-2.5">
      <GradeSummaryCard
        {isFullyGraded}
        {totalScore}
        {sumGradedScores}
        {gradedCount}
        exercisesLength={exercises.length}
        {totalMaxPoints}
        {calculatedGradeDetail}
      />

      <GradingActions {onSave} {onPrev} {onNext} {currentIndex} />
    </div>
  </div>
</div>

<LastSubmissionModal {examId} onStay={onStayOnLastSub} />

<ClearAnnotationsModal
  onConfirm={async () => {
    await viewerRef?.clearAnnotations();
    gradingStore.setShowClearConfirmModal(false);
  }}
  onCancel={cancelClearAnnotations}
/>
