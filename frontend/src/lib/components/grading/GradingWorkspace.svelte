<script lang="ts">
  import type { ExamRecord, ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import { gradingStore } from "#lib/grading/gradingStore";
  import GradingHeader from "./GradingHeader.svelte";
  import ZoomPageControls from "./ZoomPageControls.svelte";
  import AnnotationToolbar from "./AnnotationToolbar.svelte";
  import ScoreCard from "./ScoreCard.svelte";
  import ScanCanvasViewer from "./ScanCanvasViewer.svelte";
  import { t } from "#lib/i18n";
  import { faFlagCheckered } from "@fortawesome/free-solid-svg-icons";
  import { HeroDialog } from "#lib/components/ui";
  import { examHref } from "#lib/utils/links";
  import type { ScoreBoxContext } from "#lib/grading/scoreBoxes";
  import type { AutosaveStatus } from "#lib/utils/autosave";
  import { capabilitiesStore } from "#lib/stores/capabilities";

  interface Props {
    examId: string;
    exam: ExamRecord | null;
    submissions: SubmissionRecord[];
    exercises: ExerciseRecord[];
    currentIndex: number;
    currentSub: SubmissionRecord | undefined;
    calculatedGrade: { grade: string; label: string } | null;
    /** Grade of the points so far; preliminary until `isFullyGraded` (issue #330). */
    gradeDetail: GradeDetail | null;
    isFullyGraded: boolean;
    sumGradedScores: number;
    gradedCount: number;
    totalMaxPoints: number;
    onSubmissionHydrated: (fullSub: SubmissionRecord) => void;
    /** The autosave's "Saving… / Saved" state (issue #233). */
    saveStatus: AutosaveStatus;
    onPrev: () => void;
    onNext: () => void;
    onStayOnLastSub: () => void;
    /** Saves the pending score edits; rejects when that fails (the objection reply needs them stored). */
    onFlush: () => Promise<void>;
    scoreBoxes?: ScoreBoxContext | null;
  }

  let {
    examId,
    exam,
    submissions,
    exercises,
    currentIndex,
    currentSub,
    calculatedGrade,
    gradeDetail,
    isFullyGraded,
    sumGradedScores,
    gradedCount,
    totalMaxPoints,
    onSubmissionHydrated,
    saveStatus,
    onPrev,
    onNext,
    onStayOnLastSub,
    onFlush,
    scoreBoxes = null
  }: Props = $props();

  /* Controls on the teacher's chosen side (issue #328). */
  let side = $derived($capabilitiesStore?.gradingControlsSide ?? "left");

  let viewerRef: ReturnType<typeof ScanCanvasViewer> | undefined = $state();

  // The scan keeps clear of the rail: Fit places the page beside the toolbox and the open score card (both 0 on phones, where the rail dissolves).
  let toolboxWidth = $state(0);
  let cardWidth = $state(0);
  let scoreCardCollapsed = $state(false);
  const RAIL_GAP = 8;
  let openCard = $derived(scoreCardCollapsed ? 0 : RAIL_GAP + cardWidth);
  let railInset = $derived(toolboxWidth > 0 ? 12 + toolboxWidth + openCard : 0);

  /** Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl+Y redo; a focused field keeps its own text undo. */
  function onKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    const key = e.key.toLowerCase();
    const redo = (key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey);
    if (key !== "z" && !redo) return;
    e.preventDefault();
    if (redo) viewerRef?.redo();
    else viewerRef?.undo();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<GradingHeader
  {examId}
  {exam}
  {currentIndex}
  submissionsLength={submissions.length}
  {currentSub}
  {calculatedGrade}
/>

<!-- `flex-1 min-h-0` rather than a viewport-height magic number: the grade page root is a flex column that fills the space above the footer. From `md` the scan takes the whole card and the controls float on the teacher's side (issue #328): a rail with the toolbox and the score card, the bottom bar below it (issue #330). On phones the rail dissolves (`contents`): toolbox strip above the scan, bottom bar and score sheet below it. -->
<div class="box-border flex min-h-0 w-full flex-1 flex-col overflow-hidden p-2" data-controls-side={side}>
  <div class="relative flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-md border border-line bg-surface-sunken md:gap-0">
    <div
      class="contents md:absolute md:top-3 md:bottom-16 md:z-40 md:flex md:gap-2 {side === 'right' ? 'md:right-3 md:flex-row-reverse' : 'md:left-3'}"
      data-grading-rail
    >
      <div class="contents md:block md:h-full" bind:clientWidth={toolboxWidth}>
        <AnnotationToolbar onClear={() => viewerRef?.clearAnnotations()} {side} />
      </div>
      <div class="contents md:block md:h-full" bind:clientWidth={cardWidth}>
        <ScoreCard
          {examId}
          {exercises}
          {currentSub}
          {currentIndex}
          {isFullyGraded}
          {sumGradedScores}
          {gradedCount}
          {totalMaxPoints}
          {gradeDetail}
          {saveStatus}
          {onPrev}
          {onNext}
          {onFlush}
          bind:collapsed={scoreCardCollapsed}
          class="order-last md:order-none"
        />
      </div>
    </div>

    <ScanCanvasViewer
      bind:this={viewerRef}
      {examId}
      submission={currentSub}
      {exercises}
      {onSubmissionHydrated}
      {scoreBoxes}
      {side}
      inset={railInset}
    />

    <ZoomPageControls
      onUndo={() => viewerRef?.undo()}
      onRedo={() => viewerRef?.redo()}
      onPagePrev={() => viewerRef?.goPagePrev()}
      onPageNext={() => viewerRef?.goPageNext()}
      onZoomOut={() => viewerRef?.zoomOut()}
      onZoomIn={() => viewerRef?.zoomIn()}
      onResetZoom={() => viewerRef?.resetZoom()}
      {side}
    />
  </div>
</div>

<HeroDialog
  open={$gradingStore.showLastSubModal}
  icon={faFlagCheckered}
  tone="info"
  title={$t("grading.lastSubmission.title")}
  body={$t("grading.lastSubmission.body")}
  primary={{ label: $t("grading.lastSubmission.backToOverview"), href: examHref(examId) }}
  secondary={{ label: $t("grading.lastSubmission.stayHere"), onClick: onStayOnLastSub }}
/>
