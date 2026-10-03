<script lang="ts">
  import { onMount } from "svelte";
  import type { ExerciseRecord, ExerciseScoreRecord, OmrScoreMeta } from "$lib/db/schema";
  import {
    applyMcCorrection,
    restoreOriginalDetection,
    confirmDetection,
    type McQuestionType,
  } from "$lib/grading/mcScore";
  import { renderMcCrop } from "$lib/grading/mcCropRender";
  import { t, translate } from "$lib/i18n";
  import { isMcReviewed, type McQueueCategory } from "$lib/grading/mcVerification";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { faArrowUpRightFromSquare, faCheck, faCircle } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Badge, Button, Icon, Switch } from "$lib/components/ui";
  import { safeLocalStorage } from "$lib/utils/storage";

  interface StudentQueueItem {
    exerciseId: string;
    exerciseLabel: string;
    category: McQueueCategory;
    isReviewed: boolean;
  }

  export let exercise: ExerciseRecord;
  export let studentLabel: string;
  export let submissionId: string = "";
  export let studentTotal: number = 1;
  export let studentReviewed: number = 0;
  export let studentItems: StudentQueueItem[] = [];
  export let currentExerciseId: string = "";
  export let scoreRecord: ExerciseScoreRecord | null = null;
  export let scanPdfBytes: Uint8Array | null = null;
  export let currentIndex: number = 0;
  export let totalItems: number = 0;
  export let neighbourRects: Array<[number, number, number, number]> = [];
  /** Queue label (title + sub-letter for MC-group members); falls back to the exercise name. */
  export let exerciseLabel: string = "";

  export let onSave: (
    exerciseId: string,
    selectedOptions: number[],
    score: number,
    omrMeta: OmrScoreMeta
  ) => Promise<void>;
  export let onNext: () => void;
  export let onPrev: () => void;
  export let onEndOfQueue: () => void = () => {};
  export let onOpenGrading: () => void;
  export let onNavigateToItem: (exerciseId: string, category: McQueueCategory) => void = () => {};

  $: isLastItem = currentIndex >= totalItems - 1;

  let selectedOptions: number[] = [];
  let omrMeta: OmrScoreMeta | undefined = undefined;
  let cropDataUrl: string | null = null;
  let cropMarkedUrl: string | null = null;
  let loadingCrop = false;
  let cropError = "";
  let isSaving = false;
  let cropRequestId = 0;
  let justRestored = false;

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

  let showOverlay: boolean = loadOverlayPreference();

  function toggleOverlay() {
    showOverlay = !showOverlay;
    saveOverlayPreference(showOverlay);
  }

  $: {
    selectedOptions = scoreRecord?.selectedOptions ?? [];
    omrMeta = scoreRecord?.omrMeta;
  }

  $: options = exercise.options ?? [];
  $: correctAnswers = exercise.correctAnswers ?? [];
  $: questionType = (exercise.questionType as McQuestionType) || "mc";
  $: isSingleAnswer = questionType === "sc" || questionType === "tf";
  $: flaggedOptions = new Set(omrMeta?.flaggedOptions ?? []);
  // Why shape analysis changed/flagged a box — recorded at detection, survives corrections.
  $: reasonsByOption = new Map(
    (omrMeta?.detections?.bubbles ?? []).map((b) => [b.optionIndex, b.reasons ?? []])
  );
  // The detector's provisional reading of an uncertain box — what counts until verified.
  $: provisionalByOption = new Map(
    (omrMeta?.detections?.bubbles ?? [])
      .filter((b) => b.detectedState === "ambiguous" && b.provisional !== undefined)
      .map((b) => [b.optionIndex, b.provisional as boolean])
  );
  $: confidence = omrMeta?.confidence ?? "ambiguous";
  $: source = omrMeta?.source ?? "omr";

  $: currentScore = scoreRecord?.score ?? 0;

  // Redraws whenever the bubble positions OR their marked/blank state change,
  // or when the active submission or exercise changes. Incorporating submissionId
  // and exercise.id ensures template-key collisions across submissions are eliminated.
  $: cropKey =
    scanPdfBytes && omrMeta?.detections && submissionId && exercise?.id
      ? `${submissionId}:${exercise.id}:${omrMeta.detections.pageIndex}:${neighbourRects.map((r) => r.join(",")).join(";")}:${omrMeta.detections.bubbles
          .map((b) => `${b.optionIndex}:${b.state}:${b.rect.join(",")}`)
          .join("|")}:${isMcReviewed(omrMeta) ? "r" : "u"}`
      : "";

  let lastLoadedCropKey = "";
  $: {
    if (cropKey !== lastLoadedCropKey) {
      lastLoadedCropKey = cropKey;
      cropDataUrl = null;
      cropMarkedUrl = null;
      cropError = "";
      if (scanPdfBytes && omrMeta?.detections && cropKey) {
        loadCrop(
          scanPdfBytes,
          omrMeta.detections.pageIndex,
          omrMeta.detections.bubbles,
          omrMeta
        );
      }
    }
  }

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
        overlay: { exercise, omrMeta: currentOmrMeta },
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

    selectedOptions = res.nextSelectedOptions;
    omrMeta = res.nextOmrMeta;
    justRestored = true;
    setTimeout(() => {
      justRestored = false;
    }, 700);

    isSaving = true;
    try {
      await onSave(exercise.id, res.nextSelectedOptions, res.nextScore, res.nextOmrMeta);
    } catch (err) {
      console.error("Failed to restore original detection:", err);
    } finally {
      isSaving = false;
    }
  }

  async function handleConfirmAsCorrect() {
    if (isSaving) return;
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

  $: originalOptions = omrMeta?.original?.selectedOptions ?? null;
  $: hasOriginal = originalOptions !== null;
  $: isMatchesOriginal =
    hasOriginal &&
    originalOptions!.length === selectedOptions.length &&
    originalOptions!.every((o) => selectedOptions.includes(o));

  // Mirrors computeMcVerificationStats' own isReviewed/isCorrected semantics
  // exactly, so this badge can never drift from the calibration stats.
  type ReviewStatus = "unreviewed" | "confirmedUnchanged" | "manuallyCorrected";
  $: reviewStatus = ((): ReviewStatus => {
    const reviewed = isMcReviewed(omrMeta);
    if (!reviewed) return "unreviewed";
    return hasOriginal && !isMatchesOriginal ? "manuallyCorrected" : "confirmedUnchanged";
  })();

  // Guards the two advance paths (Next button, → key) so an accidental
  // keypress can't silently accept an untouched detection — the teacher must
  // either review the item or explicitly confirm they want to skip it.
  let pendingAdvance: (() => void) | null = null;

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
    return indices
      .map((i) => (options[i] ? `${String.fromCharCode(65 + i)}` : `#${i + 1}`))
      .join(", ");
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (isSaving) return;

    if (e.key >= "1" && e.key <= "9") {
      const idx = Number(e.key) - 1;
      if (idx < options.length) {
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
</script>

<svelte:window on:keydown={handleKeydown} />

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
          <Switch
            checked={showOverlay}
            label={$t("scanning.itemCard.overlayToggleLabel")}
            title={showOverlay ? $t("scanning.itemCard.hideOverlayTooltip") : $t("scanning.itemCard.showOverlayTooltip")}
            class="text-sm"
            onChange={() => toggleOverlay()}
          />
        </div>
        <span class="font-mono text-xs text-muted">
          {$t("scanning.itemCard.sourceConfidence", { source, confidence })}
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

        {#if confidence === "failed"}
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
          {#each options as opt, idx}
            {@const isSelected = selectedOptions.includes(idx)}
            {@const isCorrect = correctAnswers.includes(idx)}
            {@const isFlagged = flaggedOptions.has(idx)}
            {@const letter = String.fromCharCode(65 + idx)}
            <div
              role="button"
              tabindex="0"
              on:click={() => handleToggleOption(idx)}
              on:keydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggleOption(idx);
                }
              }}
              class="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-all duration-150 cursor-pointer select-none pointer-coarse:min-h-11
                {isSelected ? 'border-primary bg-highlight font-semibold' : 'border-line bg-surface-sunken hover:border-line-strong'}
                {isFlagged ? 'border-dashed border-warning' : ''}"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isSaving}
                  aria-label={$t("scanning.itemCard.checkboxLabel", { label: letter })}
                  on:click|stopPropagation={() => handleToggleOption(idx)}
                  class="size-5 shrink-0 cursor-pointer rounded-sm accent-primary pointer-events-auto"
                />
                <span class="font-mono text-xs text-muted font-bold">{letter}.</span>
                <span class="flex min-w-0 flex-col">
                  <span class="text-content truncate">{opt}</span>
                  {#each reasonsByOption.get(idx) ?? [] as reason}
                    <span class="text-xs font-normal text-warning-fg">{$t(`scanning.itemCard.reason.${reason}`)}</span>
                  {/each}
                  {#if reviewStatus === "unreviewed" && provisionalByOption.has(idx)}
                    <span class="text-xs font-normal text-warning-fg">
                      {provisionalByOption.get(idx)
                        ? $t("scanning.itemCard.provisionalTicked")
                        : $t("scanning.itemCard.provisionalNotTicked")}
                    </span>
                  {/if}
                </span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                {#if isSelected}
                  <span class={isCorrect ? "text-success-fg font-bold text-xs" : "text-danger-fg font-bold text-xs"}>
                    {isCorrect ? $t("scanning.itemCard.correct") : $t("scanning.itemCard.incorrect")}
                  </span>
                {:else if isCorrect}
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
          <Button size="sm" severity="success" disabled={isSaving} title={$t("scanning.itemCard.confirmDetectionTooltip")} onClick={handleConfirmAsCorrect}>
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
  isOpen={pendingAdvance !== null}
  title={$t("scanning.itemCard.confirmAdvanceTitle")}
  message={$t("scanning.itemCard.confirmAdvanceMessage")}
  confirmText={$t("scanning.itemCard.confirmAdvanceProceed")}
  cancelText={$t("scanning.itemCard.confirmAdvanceCancel")}
  on:confirm={handleConfirmAdvance}
  on:cancel={handleCancelAdvance}
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
