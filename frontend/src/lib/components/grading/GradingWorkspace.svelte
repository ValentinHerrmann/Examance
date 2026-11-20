<script lang="ts">
  import type { ExamRecord, ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { isMcQuestion } from "#lib/grading/mcScore";
  import GradingHeader from "./GradingHeader.svelte";
  import GradeSummaryCard from "./GradeSummaryCard.svelte";
  import ZoomPageControls from "./ZoomPageControls.svelte";
  import AnnotationToolbar from "./AnnotationToolbar.svelte";
  import ScoreEntry from "./ScoreEntry.svelte";
  import McAnswerReview from "./McAnswerReview.svelte";
  import GradingActions from "./GradingActions.svelte";
  import ReviewReplyBar from "./ReviewReplyBar.svelte";
  import ScanCanvasViewer from "./ScanCanvasViewer.svelte";
  import { t } from "#lib/i18n";
  import { faChevronDown, faChevronUp, faFlagCheckered, faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import { Button, HeroDialog } from "#lib/components/ui";
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
    calculatedGradeDetail: GradeDetail | null;
    isFullyGraded: boolean;
    totalScore: number | undefined;
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
    calculatedGradeDetail,
    isFullyGraded,
    totalScore,
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

  /* Controls on the teacher's chosen side from `lg` up, so the writing hand never covers them (issue #328). Literal class strings so Tailwind sees them. */
  let side = $derived($capabilitiesStore?.gradingControlsSide ?? "left");
  const LAYOUT = {
    left: {
      grid: "lg:grid-cols-[11rem_minmax(0,1fr)]",
      canvas: "lg:col-start-2 lg:row-start-1",
      panel: "lg:col-start-1 lg:row-start-1",
    },
    right: {
      grid: "lg:grid-cols-[minmax(0,1fr)_11rem]",
      canvas: "",
      panel: "",
    },
  } as const;
  let layout = $derived(LAYOUT[side]);

  let viewerRef: ReturnType<typeof ScanCanvasViewer> | undefined = $state();

  // Below `lg` the score panel is a bottom sheet (a fixed column left the scan ~70px on phones); collapsed it shows summary + navigation, expanded it takes the screen for score entry.
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

<!-- `flex-1 min-h-0` rather than a viewport-height magic number: the grade page root is a flex column that fills the space above the footer, and the old value broke as soon as the header wrapped to a second line. From `lg` the score panel is a slim 11rem column, leaving the room to draw (issue #328); DOM order stays canvas first, so the stacked layout below `lg` is unchanged. -->
<div
  class="box-border grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden p-2
    lg:grid-rows-1 {layout.grid}"
  data-controls-side={side}
>
  <div class="relative flex min-h-0 w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-md border border-line bg-surface-sunken lg:h-full lg:gap-0 {layout.canvas}">
    <AnnotationToolbar onClearRequested={requestClearAnnotations} {side} />

    <ScanCanvasViewer
      bind:this={viewerRef}
      {examId}
      submission={currentSub}
      {exercises}
      {onSubmissionHydrated}
      {scoreBoxes}
    />

    <ZoomPageControls
      onPagePrev={() => viewerRef?.goPagePrev()}
      onPageNext={() => viewerRef?.goPageNext()}
      onToggleAutoCrop={() => viewerRef?.toggleAutoCrop()}
      onZoomOut={() => viewerRef?.zoomOut()}
      onZoomIn={() => viewerRef?.zoomIn()}
      onResetZoom={() => viewerRef?.resetZoom()}
      {side}
    />
  </div>

  <div
    class="box-border flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-line bg-surface-sunken
      {isScorePanelExpanded ? 'h-[70dvh]' : ''} lg:h-full {layout.panel}"
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

    <div class="flex shrink-0 flex-col gap-2 border-t border-line bg-surface-raised px-3 py-2 lg:px-2">
      <GradeSummaryCard
        {isFullyGraded}
        {totalScore}
        {sumGradedScores}
        {gradedCount}
        exercisesLength={exercises.length}
        {totalMaxPoints}
        {calculatedGradeDetail}
      />

      <ReviewReplyBar {examId} sub={currentSub} {exercises} {onFlush} />

      <GradingActions {saveStatus} {onPrev} {onNext} {currentIndex} />
    </div>
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

<!-- Destructive: the clearing waits for this explicit confirmation. -->
<HeroDialog
  open={$gradingStore.showClearConfirmModal}
  icon={faTrashCan}
  tone="danger"
  title={$t("grading.clearModal.title")}
  body={$t("grading.clearModal.body")}
  primary={{
    label: $t("grading.clearModal.confirm"),
    onClick: async () => {
      await viewerRef?.clearAnnotations();
      gradingStore.setShowClearConfirmModal(false);
    },
  }}
  secondary={{ label: $t("common.cancel"), onClick: cancelClearAnnotations }}
/>
