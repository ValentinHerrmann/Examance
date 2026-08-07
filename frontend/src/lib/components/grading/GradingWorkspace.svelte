<script lang="ts">
  import "./GradingWorkspace.css";
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

<div class="grading-workspace-grading-workspace">
  <div class="grading-workspace-canvas-panel">
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

  <div class="grading-workspace-grading-panel">
    <ScoreEntry {exercises} />

    <div class="grading-workspace-grading-panel-pinned">
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
