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

  export let examId: string;
  export let exam: ExamRecord | null;
  export let submissions: SubmissionRecord[];
  export let exercises: ExerciseRecord[];
  export let currentIndex: number;
  export let currentSub: SubmissionRecord | undefined;
  export let calculatedGrade: { grade: string; label: string } | null;
  export let calculatedGradeDetail: GradeDetail | null;
  export let isFullyGraded: boolean;
  export let totalScore: number | undefined;
  export let sumGradedScores: number;
  export let gradedCount: number;
  export let totalMaxPoints: number;

  export let onSubmissionHydrated: (fullSub: SubmissionRecord) => void;
  export let onSave: () => void;
  export let onPrev: () => void;
  export let onNext: () => void;
  export let onStayOnLastSub: () => void;

  let viewerRef: ScanCanvasViewer;

  /* Below `lg` the score panel is a bottom sheet rather than a fixed 280px
   * column — at phone widths that column left the scan about 70px of space.
   * Collapsed it shows only the summary + navigation; expanded it takes the
   * screen for score entry. Irrelevant from `lg` up, where both fit side by
   * side. */
  let isScorePanelExpanded = false;

  $: activeExercise = exercises.find((e) => e.id === $gradingStore.activeExerciseId);

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

<!-- `h-full` rather than a `calc(100vh - 44px)` magic number: the app shell
     already sizes this pane, and the old value broke as soon as the header
     wrapped to a second line. -->
<div
  class="box-border grid h-full min-h-0 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden p-2
    lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1"
>
  <div class="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 lg:gap-0">
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
    class="box-border flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900
      {isScorePanelExpanded ? 'h-[70dvh]' : ''} lg:h-full"
  >
    <button
      type="button"
      class="flex shrink-0 cursor-pointer items-center justify-between gap-2 border-none border-b border-line bg-surface-inset px-3 py-2 text-sm font-semibold text-content lg:hidden"
      aria-expanded={isScorePanelExpanded}
      on:click={() => (isScorePanelExpanded = !isScorePanelExpanded)}
    >
      <span>{$t("grading.workspace.scorePanel")}</span>
      <span aria-hidden="true">{isScorePanelExpanded ? "▼" : "▲"}</span>
    </button>

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

    <div class="flex shrink-0 flex-col gap-2 border-t border-slate-700 bg-slate-800 px-3 py-[0.65rem]">
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
