<script lang="ts">
  import type { ExamRecord, ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import { gradingStore } from "#lib/grading/gradingStore";
  import GradingHeader from "./GradingHeader.svelte";
  import ZoomPageControls from "./ZoomPageControls.svelte";
  import AnnotationToolbar from "./AnnotationToolbar.svelte";
  import ScoreCard from "./ScoreCard.svelte";
  import ScanCanvasViewer from "./ScanCanvasViewer.svelte";
  import ExerciseSwitchDialog from "./ExerciseSwitchDialog.svelte";
  import { t } from "#lib/i18n";
  import { faFlagCheckered } from "@fortawesome/free-solid-svg-icons";
  import { ConfirmDialog, HeroDialog } from "#lib/components/ui";
  import { gradingTargets, selectTarget, stepTarget, targetIndex, targetInputId } from "#lib/grading/gradingTargets";
  import { tick } from "svelte";
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
    /** Maximum of the exercises scored so far (the preliminary grade's base). */
    gradedMaxPoints: number;
    onSubmissionHydrated: (fullSub: SubmissionRecord) => void;
    /** The autosave's "Saving… / Saved" state (issue #233). */
    saveStatus: AutosaveStatus;
    /** Student switches; resolve once the switch ran (or was refused). */
    onPrev: () => Promise<void>;
    onNext: () => Promise<void>;
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
    gradedMaxPoints,
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
  let switchDialog: ReturnType<typeof ExerciseSwitchDialog> | undefined = $state();

  // The scan keeps clear of the rail: Fit places the page beside the toolbox and the open score card (both 0 on phones, where the rail dissolves).
  let toolboxWidth = $state(0);
  let cardWidth = $state(0);
  let scoreCardCollapsed = $state(false);
  const RAIL_GAP = 8;
  let openCard = $derived(scoreCardCollapsed ? 0 : RAIL_GAP + cardWidth);
  let railInset = $derived(toolboxWidth > 0 ? 12 + toolboxWidth + openCard : 0);

  // The exercise stepper (issue #330): leaving the list at either end asks before switching the student.
  let wrap: 1 | -1 | null = $state(null);

  async function step(dir: 1 | -1) {
    const targets = gradingTargets(exercises);
    const state = $gradingStore;
    const next = stepTarget(targets, targetIndex(targets, state.activeExerciseId, state.activePartLabel), dir);
    if (next.kind === "before") {
      if (currentIndex > 0) wrap = -1;
      return;
    }
    if (next.kind === "after") {
      // The last student: the end-of-submissions dialog answers instead.
      if (currentIndex >= submissions.length - 1) void onNext();
      else wrap = 1;
      return;
    }
    // Enter in a score field carries the focus along, so typing goes on with the next target.
    const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.id.startsWith("score-") && document.activeElement.id !== "score-stepper";
    const target = targets[next.index];
    selectTarget(target);
    await tick();
    const field = document.getElementById(targetInputId(target));
    field?.scrollIntoView({ block: "nearest" });
    if (typing && field instanceof HTMLInputElement) {
      field.focus();
      field.select();
    }
  }

  async function confirmWrap() {
    const dir = wrap;
    wrap = null;
    const before = currentIndex;
    await (dir === 1 ? onNext() : onPrev());
    // Always the first exercise, also when going back; a refused switch keeps the target.
    if (currentIndex !== before) selectTarget(gradingTargets(exercises)[0]);
  }

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
  {saveStatus}
  {onPrev}
  {onNext}
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
          {isFullyGraded}
          {sumGradedScores}
          {gradedCount}
          {totalMaxPoints}
          {gradedMaxPoints}
          {gradeDetail}
          onStep={step}
          atFirstStudent={currentIndex === 0}
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
      onAskTarget={(question) => switchDialog?.ask(question) ?? null}
    />

    <ZoomPageControls
      onUndo={() => viewerRef?.undo()}
      onRedo={() => viewerRef?.redo()}
      onZoomOut={() => viewerRef?.zoomOut()}
      onZoomIn={() => viewerRef?.zoomIn()}
      onResetZoom={() => viewerRef?.resetZoom()}
      {side}
    />
  </div>
</div>

<ConfirmDialog
  open={wrap !== null}
  title={wrap === -1 ? $t("grading.stepper.prevStudentTitle") : $t("grading.stepper.nextStudentTitle")}
  message={wrap === -1 ? $t("grading.stepper.prevStudentBody") : $t("grading.stepper.nextStudentBody")}
  confirmText={wrap === -1 ? $t("grading.actions.prev") : $t("grading.actions.next")}
  cancelText={$t("grading.stepper.stay")}
  role="dialog"
  onConfirm={confirmWrap}
  onCancel={() => (wrap = null)}
/>

<ExerciseSwitchDialog bind:this={switchDialog} />

<HeroDialog
  open={$gradingStore.showLastSubModal}
  icon={faFlagCheckered}
  tone="info"
  title={$t("grading.lastSubmission.title")}
  body={$t("grading.lastSubmission.body")}
  primary={{ label: $t("grading.lastSubmission.backToOverview"), href: examHref(examId) }}
  secondary={{ label: $t("grading.lastSubmission.stayHere"), onClick: onStayOnLastSub }}
/>
