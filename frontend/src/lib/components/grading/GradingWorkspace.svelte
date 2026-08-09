<script lang="ts">
  import type { ExamRecord, ExerciseRecord, SubmissionRecord } from "$lib/db/schema";
  import type { GradeDetail } from "$lib/analytics/gradingKey";
  import { gradingStore } from "$lib/grading/gradingStore";
  import GradingHeader from "./GradingHeader.svelte";
  import GradeSummaryCard from "./GradeSummaryCard.svelte";
  import ZoomPageControls from "./ZoomPageControls.svelte";
  import AnnotationToolbar from "./AnnotationToolbar.svelte";
  import ScoreEntry from "./ScoreEntry.svelte";
  import ClearAnnotationsModal from "./ClearAnnotationsModal.svelte";
  import LastSubmissionModal from "./LastSubmissionModal.svelte";
  import GradingActions from "./GradingActions.svelte";
  import ScanCanvasViewer from "./ScanCanvasViewer.svelte";

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

<div class="box-border grid h-[calc(100vh-44px)] w-full flex-1 min-h-0 grid-cols-[minmax(0,1fr)_280px] gap-2 overflow-hidden p-2">
  <div class="relative flex w-full min-w-0 min-h-0 h-full flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
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

  <div class="box-border flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
    <ScoreEntry {exercises} />

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
