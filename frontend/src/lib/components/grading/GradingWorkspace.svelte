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

<div class="grading-workspace">
  <div class="canvas-panel">
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

  <div class="grading-panel">
    <ScoreEntry {exercises} />

    <div class="grading-panel-pinned">
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

<style>
  .grading-workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 0.5rem;
    padding: 0.5rem;
    width: 100%;
    height: calc(100vh - 44px);
    box-sizing: border-box;
    overflow: hidden;
  }

  .canvas-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #020617;
    border: 1px solid #1e293b;
    border-radius: 8px;
    overflow: hidden;
    width: 100%;
    min-width: 0;
  }

  .grading-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .grading-panel-pinned {
    flex-shrink: 0;
    padding: 0.65rem 0.75rem;
    background: #1e293b;
    border-top: 1px solid #334155;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>
