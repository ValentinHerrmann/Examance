<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { ExerciseRecord, ExerciseScoreRecord, OmrScoreMeta } from "#lib/db/schema";
  import {
    applyMcCorrection,
    computeMcScore,
    restoreOriginalDetection,
    confirmDetection,
    type McQuestionType,
  } from "#lib/grading/mcScore";
  import { matchBoxesToOptions } from "#lib/grading/mcBoxOptions";
  import { renderMcCrop } from "#lib/grading/mcCropRender";
  import { t, translate } from "#lib/i18n";
  import { isMcReviewed, type McQueueCategory } from "#lib/grading/mcVerification";
  import { faArrowUpRightFromSquare, faCheck, faCircle } from "@fortawesome/free-solid-svg-icons";
  import { ConfirmDialog, Alert, Badge, Button, Icon, Switch } from "#lib/components/ui";
  import { safeLocalStorage } from "#lib/utils/storage";

  interface StudentQueueItem {
    exerciseId: string;
    exerciseLabel: string;
    category: McQueueCategory;
    isReviewed: boolean;
  }

  interface Props {
    exercise: ExerciseRecord;
    studentLabel: string;
    submissionId?: string;
    studentTotal?: number;
    studentReviewed?: number;
    studentItems?: StudentQueueItem[];
    currentExerciseId?: string;
    scoreRecord?: ExerciseScoreRecord | null;
    scanPdfBytes?: Uint8Array | null;
    currentIndex?: number;
    totalItems?: number;
    neighbourRects?: Array<[number, number, number, number]>;
    /** Queue label (title + sub-letter for MC-group members); falls back to the exercise name. */
    exerciseLabel?: string;
    onSave: (
      exerciseId: string,
      selectedOptions: number[],
      score: number,
      omrMeta: OmrScoreMeta
    ) => Promise<void>;
    onNext: () => void;
    onPrev: () => void;
    onEndOfQueue?: () => void;
    onOpenGrading: () => void;
    onNavigateToItem?: (exerciseId: string, category: McQueueCategory) => void;
  }

  let {
    exercise,
    studentLabel,
    submissionId = "",
    studentTotal = 1,
    studentReviewed = 0,
    studentItems = [],
    currentExerciseId = "",
    scoreRecord = null,
    scanPdfBytes = null,
    currentIndex = 0,
    totalItems = 0,
    neighbourRects = [],
    exerciseLabel = "",
    onSave,
    onNext,
    onPrev,
    onEndOfQueue = () => {},
    onOpenGrading,
    onNavigateToItem = () => {}
  }: Props = $props();

  let isLastItem = $derived(currentIndex >= totalItems - 1);

  // Writable $derived: reset from scoreRecord whenever it changes, overridden locally by corrections.
  let selectedOptions: number[] = $derived(scoreRecord?.selectedOptions ?? []);
  let omrMeta: OmrScoreMeta | undefined = $derived(scoreRecord?.omrMeta);
  let cropDataUrl: string | null = $state(null);
  let cropMarkedUrl: string | null = $state(null);
  let loadingCrop = $state(false);
  let cropError = $state("");
  let isSaving = $state(false);
  let cropRequestId = 0;
  let justRestored = $state(false);

  const OVERLAY_STORAGE_KEY = "bg_mc_verify_overlay";

  function loadOverlayPreference(): boolean {
    try {
      const stored = safeLocalStorage.getItem(OVERLAY_STORAGE_KEY);
      if (stored === null) return true;
      return stored !== "false";
    } catch {
      return true;
    }
  }

  function saveOverlayPreference(val: boolean): void {
    try {
      safeLocalStorage.setItem(OVERLAY_STORAGE_KEY, String(val));
    } catch {
      // safeLocalStorage catches errors, but outer try-catch guarantees safety
    }
  }

  let showOverlay: boolean = $state(loadOverlayPreference());

  function toggleOverlay() {
    showOverlay = !showOverlay;
    saveOverlayPreference(showOverlay);
  }

  let correctAnswers = $derived(exercise.correctAnswers ?? []);
  let questionType = $derived((exercise.questionType as McQuestionType) || "mc");
  // Each box carries its own reading (reasons, provisional verdict); a box/option mismatch is shown
  // as such and not scored here, never mapped onto other options.
  let boxOptions = $derived(matchBoxesToOptions(exercise, omrMeta?.detections));
  let options = $derived(boxOptions.options);
  let mismatch = $derived(boxOptions.mismatch);
  let flaggedOptions = $derived(new Set(omrMeta?.flaggedOptions ?? []));
  let confidence = $derived(omrMeta?.confidence ?? "ambiguous");
  let source = $derived(omrMeta?.source ?? "omr");

  // Recomputed from the current answer key: a stored score can predate a fix of the options.
  let currentScore = $derived(mismatch ? (scoreRecord?.score ?? 0) : scoreFor(selectedOptions));

  function scoreFor(selection: number[]): number {
    return computeMcScore(questionType, selection, correctAnswers, exercise.penalty ?? 0, exercise.maxPoints);
  }

  // Redraws when bubble positions/states, submission or exercise change; the ids avoid
  // template-key collisions across submissions.
  let cropKey = $derived(
    scanPdfBytes && omrMeta?.detections && submissionId && exercise?.id
      ? `${submissionId}:${exercise.id}:${omrMeta.detections.pageIndex}:${neighbourRects.map((r) => r.join(",")).join(";")}:${omrMeta.detections.bubbles
          .map((b) => `${b.optionIndex}:${b.state}:${b.rect.join(",")}`)
          .join("|")}:${isMcReviewed(omrMeta) ? "r" : "u"}`
      : ""
  );

  let lastLoadedCropKey = "";

  async function loadCrop(
    pdfBytes: Uint8Array,
    pageIndex: number,
    bubbles: Array<{ optionIndex: number; rect: [number, number, number, number] }>,
    currentOmrMeta: OmrScoreMeta
  ) {
    const thisRequestId = ++cropRequestId;
    loadingCrop = true;
    cropError = "";
    try {
      const url = await renderMcCrop({
        pdfBytes,
        pageIndex,
        bubbles,
        scale: 3.0,
        neighbourRects,
        // The overlay stamps right/wrong per optionIndex, which is meaningless on a mismatch.
        overlay: mismatch ? undefined : { exercise, omrMeta: currentOmrMeta },
      });
      if (thisRequestId !== cropRequestId) return;
      cropDataUrl = url.plain;
      cropMarkedUrl = url.marked;
    } catch (err: any) {
      if (thisRequestId !== cropRequestId) return;
      console.error("Failed to render crop:", err);
      cropError = translate("scanning.itemCard.cropRenderError");
    } finally {
      if (thisRequestId === cropRequestId) {
        loadingCrop = false;
      }
    }
  }

  async function handleToggleOption(idx: number) {
    if (mismatch) return;
    const { nextSelectedOptions, nextScore, nextOmrMeta } = applyMcCorrection(
      questionType,
      selectedOptions,
      idx,
      correctAnswers,
      exercise.penalty ?? 0,
      exercise.maxPoints,
      omrMeta
    );

    selectedOptions = nextSelectedOptions;
    omrMeta = nextOmrMeta;

    isSaving = true;
    try {
      await onSave(exercise.id, nextSelectedOptions, nextScore, nextOmrMeta);
    } catch (err) {
      console.error("Failed to save correction:", err);
    } finally {
      isSaving = false;
    }
  }

  async function handleRestoreOriginal() {
    if (!omrMeta?.original || isSaving) return;
    const res = restoreOriginalDetection(
      questionType,
      correctAnswers,
      exercise.penalty ?? 0,
      exercise.maxPoints,
      omrMeta
    );
    if (!res) return;
    const nextScore = mismatch ? res.nextScore : scoreFor(res.nextSelectedOptions);

    selectedOptions = res.nextSelectedOptions;
    omrMeta = res.nextOmrMeta;
    justRestored = true;
    setTimeout(() => {
      justRestored = false;
    }, 700);

    isSaving = true;
    try {
      await onSave(exercise.id, res.nextSelectedOptions, nextScore, res.nextOmrMeta);
    } catch (err) {
      console.error("Failed to restore original detection:", err);
    } finally {
      isSaving = false;
    }
  }

  async function handleConfirmAsCorrect() {
    if (isSaving || mismatch) return;
    const res = confirmDetection(selectedOptions, currentScore, omrMeta);

    selectedOptions = res.nextSelectedOptions;
    omrMeta = res.nextOmrMeta;

    isSaving = true;
    try {
      await onSave(exercise.id, res.nextSelectedOptions, res.nextScore, res.nextOmrMeta);
      (currentIndex < totalItems - 1 ? onNext : onEndOfQueue)();
    } catch (err) {
      console.error("Failed to confirm detection:", err);
    } finally {
      isSaving = false;
    }
  }

  let originalOptions = $derived(omrMeta?.original?.selectedOptions ?? null);
  let hasOriginal = $derived(originalOptions !== null);
  let isMatchesOriginal = $derived(
    hasOriginal &&
      originalOptions!.length === selectedOptions.length &&
      originalOptions!.every((o) => selectedOptions.includes(o))
  );

  // Mirrors computeMcVerificationStats' own isReviewed/isCorrected semantics
  // exactly, so this badge can never drift from the calibration stats.
  type ReviewStatus = "unreviewed" | "confirmedUnchanged" | "manuallyCorrected";
  let reviewStatus = $derived.by((): ReviewStatus => {
    const reviewed = isMcReviewed(omrMeta);
    if (!reviewed) return "unreviewed";
    return hasOriginal && !isMatchesOriginal ? "manuallyCorrected" : "confirmedUnchanged";
  });

  // Guards the two advance paths (Next button, → key) so an accidental
  // keypress can't silently accept an untouched detection — the teacher must
  // either review the item or explicitly confirm they want to skip it.
  let pendingAdvance: (() => void) | null = $state(null);

  function requestAdvance(action: () => void) {
    if (reviewStatus === "unreviewed") {
      pendingAdvance = action;
    } else {
      action();
    }
  }

  function handleConfirmAdvance() {
    const action = pendingAdvance;
    pendingAdvance = null;
    action?.();
  }

  function handleCancelAdvance() {
    pendingAdvance = null;
  }

  function formatOptionLabels(indices: number[]): string {
    if (indices.length === 0) return translate("scanning.itemCard.originalNone");
    return indices.map((i) => String.fromCharCode(65 + i)).join(", ");
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (isSaving) return;

    if (e.key >= "1" && e.key <= "9") {
      const idx = Number(e.key) - 1;
      if (idx < options.length && !mismatch) {
        e.preventDefault();
        handleToggleOption(idx);
      }
      return;
    }

    if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      handleConfirmAsCorrect();
      return;
    }

    if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      toggleOverlay();
      return;
    }

    if (e.key === "r" || e.key === "R") {
      if (hasOriginal && !isMatchesOriginal) {
        e.preventDefault();
        handleRestoreOriginal();
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      if (currentIndex > 0) {
        e.preventDefault();
        onPrev();
      }
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      requestAdvance(currentIndex < totalItems - 1 ? onNext : onEndOfQueue);
    }
  }

  $effect.pre(() => {
    const key = cropKey;
    const pdfBytes = scanPdfBytes;
    const meta = omrMeta;
    untrack(() => {
      if (key !== lastLoadedCropKey) {
        lastLoadedCropKey = key;
        cropDataUrl = null;
        cropMarkedUrl = null;
        cropError = "";
        if (pdfBytes && meta?.detections && key) {
          loadCrop(pdfBytes, meta.detections.pageIndex, meta.detections.bubbles, meta);
        }
      }
    });
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-w-0 space-y-6 rounded-xl border border-line bg-surface-raised p-4 shadow-sm @3xl:p-6">
  <!-- Top Bar: Header & Counter -->
  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
    <div>
      <div class="text-sm font-semibold text-accent">
        {$t("scanning.itemCard.verificationLabel")} <span class="text-content font-bold">{studentLabel}</span>
        {#if studentTotal > 1}
          <Badge size="xs" class="ml-1 font-mono">{studentReviewed}/{studentTotal}</Badge>
        {/if}
      </div>
      <div class="mt-0.5 flex flex-wrap items-center gap-2">
        <h1 class="m-0 text-xl font-semibold text-content">
          {exerciseLabel || exercise.name || exercise.title || $t("scanning.itemCard.defaultExerciseName")}
        </h1>
        <Badge
          severity={reviewStatus === "confirmedUnchanged" ? "success" : reviewStatus === "manuallyCorrected" ? "warning" : "secondary"}
          class={justRestored ? "restore-pulse" : ""}
        >
          {#if reviewStatus === "confirmedUnchanged"}
            {$t("scanning.itemCard.statusConfirmedUnchanged")}
          {:else if reviewStatus === "manuallyCorrected"}
            {$t("scanning.itemCard.statusManuallyCorrected")}
          {:else}
            {$t("scanning.itemCard.statusUnreviewed")}
          {/if}
        </Badge>
      </div>
    </div>
    <div class="flex items-center gap-3">
      {#if totalItems > 0}
        <span class="text-xs text-muted font-mono">
          {$t("scanning.itemCard.itemCounter", { current: currentIndex + 1, total: totalItems })}
        </span>
      {/if}
      <Button variant="outlined" severity="secondary" size="sm" iconRight={faArrowUpRightFromSquare} onClick={onOpenGrading}>
        {$t("scanning.itemCard.canvasWorkspace")}
      </Button>
    </div>
  </div>

  {#if studentItems.length > 1}
    <div class="flex flex-wrap items-center gap-2 -mt-2">
      <span class="text-xs font-semibold text-muted">
        {$t("scanning.itemCard.otherItemsHeading")}
      </span>
      {#each studentItems as si}
        {@const isCurrent = si.exerciseId === currentExerciseId}
        {@const categoryLabelKey =
          si.category === "failed"
            ? "scanning.verify.queueFailed"
            : si.category === "unsure"
              ? "scanning.verify.queueUnsure"
              : "scanning.verify.queueOther"}
        <Button
          size="sm"
          variant="outlined"
          severity={isCurrent ? "primary" : "secondary"}
          disabled={isCurrent}
          title={$t(categoryLabelKey)}
          onClick={() => onNavigateToItem(si.exerciseId, si.category)}
        >
          <Icon icon={si.isReviewed ? faCheck : faCircle} class={si.isReviewed ? "" : "text-xs"} />
          <span class="max-w-40 truncate">{si.exerciseLabel}</span>
        </Button>
      {/each}
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <!-- Left Column: Scan Bubble Crop -->
    <div class="rounded-md border border-line bg-surface-sunken p-4 flex min-h-80 min-w-0 flex-col items-center justify-center">
      <div class="text-xs font-medium text-muted mb-2 w-full flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span>{$t("scanning.itemCard.scanCrop")}</span>
          {#if !mismatch}
            <Switch
              checked={showOverlay}
              label={$t("scanning.itemCard.overlayToggleLabel")}
              title={showOverlay ? $t("scanning.itemCard.hideOverlayTooltip") : $t("scanning.itemCard.showOverlayTooltip")}
              class="text-sm"
              onChange={() => toggleOverlay()}
            />
          {/if}
        </div>
        <span class="font-mono text-xs text-muted">
          {$t("scanning.itemCard.sourceConfidence", {
            source: $t(`scanning.itemCard.sourceLabel.${source}`),
            confidence: $t(`scanning.itemCard.confidenceLabel.${confidence}`),
          })}
        </span>
      </div>
      {#if omrMeta?.alignmentUncertain}
        <Alert severity="warning" class="mb-2 w-full">{$t("scanning.itemCard.alignmentUncertainWarning")}</Alert>
      {/if}

      {#if loadingCrop}
        <div class="text-xs text-muted animate-pulse py-12">{$t("scanning.itemCard.renderingCrop")}</div>
      {:else if cropError}
        <div class="text-xs text-danger-fg py-12">{cropError}</div>
      {:else if cropDataUrl}
        <div class="relative w-full overflow-hidden rounded-md border border-line bg-surface-raised">
          <img
            src={cropDataUrl}
            alt={$t("scanning.itemCard.scanCropAlt", { name: exercise.name || "" })}
            class="max-h-[70dvh] w-full object-contain"
          />
          {#if cropMarkedUrl}
            <!-- Same geometry as the plain crop, stacked on top; toggling only fades it. -->
            <img
              src={cropMarkedUrl}
              alt=""
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-150 {showOverlay
                ? 'opacity-100'
                : 'opacity-0'}"
            />
          {/if}
        </div>
      {:else}
        <div class="text-xs text-muted italic py-12 text-center">
          {$t("scanning.itemCard.noCrop")}
        </div>
      {/if}
    </div>

    <!-- Right Column: Verification Controls & Options -->
    <div class="flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <div>
            <span class="block text-sm font-semibold text-content">
              {$t("scanning.itemCard.confirmAnswers")}
            </span>
            <span class="text-xs text-muted">
              {$t("scanning.itemCard.markedBoxesHelp")}
            </span>
          </div>
          <span class="text-xs font-bold font-mono text-success-fg">
            {$t("scanning.itemCard.scoreLabel", { score: currentScore, maxPoints: exercise.maxPoints })}
          </span>
        </div>

        {#if mismatch}
          <Alert severity="danger" class="mb-3">
            {$t("scanning.itemCard.optionMismatch", { boxes: mismatch.boxes, options: mismatch.options })}
          </Alert>
        {:else if confidence === "failed"}
          <Alert severity="danger" class="mb-3">{$t("scanning.itemCard.detectionFailed")}</Alert>
        {:else if confidence === "ambiguous"}
          <Alert severity="warning" class="mb-3">{$t("scanning.itemCard.ambiguousDetection")}</Alert>
        {/if}

        {#if hasOriginal && !isMatchesOriginal}
          <div class="mb-3 p-2 rounded-md bg-surface-inset border border-line text-xs text-muted">
            {$t("scanning.itemCard.originalDetected", { options: formatOptionLabels(originalOptions ?? []) })}
          </div>
        {/if}

        <div class="space-y-2">
          {#each options as opt (opt.index)}
            {@const idx = opt.index}
            {@const isSelected = selectedOptions.includes(idx)}
            {@const isFlagged = flaggedOptions.has(idx)}
            {@const letter = String.fromCharCode(65 + idx)}
            {@const provisional = opt.bubble?.detectedState === "ambiguous" ? opt.bubble.provisional : undefined}
            <div
              role="button"
              tabindex={mismatch ? -1 : 0}
              aria-disabled={mismatch !== null}
              onclick={() => handleToggleOption(idx)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggleOption(idx);
                }
              }}
              class="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-all duration-150 select-none pointer-coarse:min-h-11
                {mismatch ? 'cursor-default' : 'cursor-pointer'}
                {isSelected ? 'border-primary bg-highlight font-semibold' : 'border-line bg-surface-sunken hover:border-line-strong'}
                {isFlagged ? 'border-dashed border-warning' : ''}"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isSaving || mismatch !== null}
                  aria-label={$t("scanning.itemCard.checkboxLabel", { label: letter })}
                  onclick={(e) => {
                    e.stopPropagation();
                    handleToggleOption(idx);
                  }}
                  class="size-5 shrink-0 cursor-pointer rounded-sm accent-primary pointer-events-auto"
                />
                <span class="font-mono text-xs text-muted font-bold">{letter}.</span>
                <span class="flex min-w-0 flex-col">
                  <span class="text-content truncate {opt.text === null ? 'italic' : ''}">
                    {opt.text ?? $t("scanning.itemCard.boxWithoutOption")}
                  </span>
                  {#each opt.bubble?.reasons ?? [] as reason}
                    <span class="text-xs font-normal text-warning-fg">{$t(`scanning.itemCard.reason.${reason}`)}</span>
                  {/each}
                  {#if reviewStatus === "unreviewed" && provisional !== undefined}
                    <span class="text-xs font-normal text-warning-fg">
                      {provisional
                        ? $t("scanning.itemCard.provisionalTicked")
                        : $t("scanning.itemCard.provisionalNotTicked")}
                    </span>
                  {/if}
                </span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                {#if opt.text !== null && isSelected}
                  <span class={opt.isCorrect ? "text-success-fg font-bold text-xs" : "text-danger-fg font-bold text-xs"}>
                    {opt.isCorrect ? $t("scanning.itemCard.correct") : $t("scanning.itemCard.incorrect")}
                  </span>
                {:else if opt.isCorrect}
                  <span class="text-muted text-xs">{$t("scanning.itemCard.keyCorrect")}</span>
                {/if}
                {#if isFlagged}
                  <span class="text-warning-fg font-bold text-xs" title={$t("scanning.itemCard.flaggedTitle")}>?</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <p class="mt-2 text-xs text-muted">
          {$t("scanning.itemCard.optionShortcutHint", { count: options.length })}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" severity="success" disabled={isSaving || mismatch !== null} title={$t("scanning.itemCard.confirmDetectionTooltip")} onClick={handleConfirmAsCorrect}>
            {$t("scanning.itemCard.confirmDetection")}
          </Button>
          {#if hasOriginal && !isMatchesOriginal}
            <Button size="sm" variant="outlined" severity="secondary" disabled={isSaving} title={$t("scanning.itemCard.restoreOriginalTooltip")} onClick={handleRestoreOriginal}>
              {$t("scanning.itemCard.restoreOriginal")}
            </Button>
          {/if}
        </div>
      </div>

      <!-- Action Navigation Footer -->
      <div class="flex items-center justify-between pt-4 border-t border-line">
        <Button variant="outlined" severity="secondary" disabled={currentIndex <= 0} onClick={onPrev}>
          {$t("scanning.itemCard.previous")}
        </Button>

        <Button onClick={() => requestAdvance(onNext)}>
          {isLastItem ? $t("scanning.itemCard.backToDashboard") : $t("scanning.itemCard.nextItem")}
        </Button>
      </div>
    </div>
  </div>
</div>

<ConfirmDialog
  open={pendingAdvance !== null}
  title={$t("scanning.itemCard.confirmAdvanceTitle")}
  message={$t("scanning.itemCard.confirmAdvanceMessage")}
  confirmText={$t("scanning.itemCard.confirmAdvanceProceed")}
  cancelText={$t("scanning.itemCard.confirmAdvanceCancel")}
  severity="danger"
  role="dialog"
  onConfirm={handleConfirmAdvance}
  onCancel={handleCancelAdvance}
/>

<style>
  @keyframes restore-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-primary) 50%, transparent);
    }
    100% {
      box-shadow: 0 0 0 8px color-mix(in srgb, var(--color-primary) 0%, transparent);
    }
  }
  :global(.restore-pulse) {
    animation: restore-pulse 0.6s ease-out;
  }
</style>
