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

  export let exercise: ExerciseRecord;
  export let studentLabel: string;
  export let submissionId: string = "";
  export let studentTotal: number = 1;
  export let studentReviewed: number = 0;
  export let scoreRecord: ExerciseScoreRecord | null = null;
  export let scanPdfBytes: Uint8Array | null = null;
  export let currentIndex: number = 0;
  export let totalItems: number = 0;

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

  $: isLastItem = currentIndex >= totalItems - 1;

  let selectedOptions: number[] = [];
  let omrMeta: OmrScoreMeta | undefined = undefined;
  let cropDataUrl: string | null = null;
  let loadingCrop = false;
  let cropError = "";
  let isSaving = false;
  let cropRequestId = 0;
  let justRestored = false;

  $: {
    selectedOptions = scoreRecord?.selectedOptions ?? [];
    omrMeta = scoreRecord?.omrMeta;
  }

  $: options = exercise.options ?? [];
  $: correctAnswers = exercise.correctAnswers ?? [];
  $: questionType = (exercise.questionType as McQuestionType) || "mc";
  $: isSingleAnswer = questionType === "sc" || questionType === "tf";
  $: flaggedOptions = new Set(omrMeta?.flaggedOptions ?? []);
  $: confidence = omrMeta?.confidence ?? "ambiguous";
  $: source = omrMeta?.source ?? "omr";

  $: currentScore = scoreRecord?.score ?? 0;

  // Redraws whenever the bubble positions OR their marked/blank state change,
  // or when the active submission or exercise changes. Incorporating submissionId
  // and exercise.id ensures template-key collisions across submissions are eliminated.
  $: cropKey =
    scanPdfBytes && omrMeta?.detections && submissionId && exercise?.id
      ? `${submissionId}:${exercise.id}:${omrMeta.detections.pageIndex}:${omrMeta.detections.bubbles
          .map((b) => `${b.optionIndex}:${b.state}:${b.rect.join(",")}`)
          .join("|")}`
      : "";

  let lastLoadedCropKey = "";
  $: {
    if (cropKey !== lastLoadedCropKey) {
      lastLoadedCropKey = cropKey;
      cropDataUrl = null;
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
        overlay: { exercise, omrMeta: currentOmrMeta },
      });
      if (thisRequestId !== cropRequestId) return;
      cropDataUrl = url;
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
    const reviewed = !!omrMeta?.reviewedAt || source === "manual";
    if (!reviewed) return "unreviewed";
    return hasOriginal && !isMatchesOriginal ? "manuallyCorrected" : "confirmedUnchanged";
  })();

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
      if (currentIndex < totalItems - 1) {
        onNext();
      } else {
        onEndOfQueue();
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-6 shadow-xl max-w-[1600px] mx-auto">
  <!-- Top Bar: Header & Counter -->
  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4">
    <div>
      <div class="text-xs font-semibold uppercase tracking-wider text-sky-400">
        {$t("scanning.itemCard.verificationLabel")} <span class="text-slate-100 font-bold">{studentLabel}</span>
        {#if studentTotal > 1}
          <span class="ml-1 px-1.5 py-0.5 text-[0.65rem] font-mono font-semibold rounded bg-slate-700/60 text-slate-300 border border-slate-600/50 normal-case tracking-normal">
            {studentReviewed}/{studentTotal}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 mt-0.5">
        <h3 class="text-lg font-bold text-slate-100">
          {exercise.name || exercise.title || $t("scanning.itemCard.defaultExerciseName")}
        </h3>
        <span
          class="px-2 py-0.5 text-[0.7rem] font-semibold rounded border transition-shadow duration-300
            {reviewStatus === 'confirmedUnchanged' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}
            {reviewStatus === 'manuallyCorrected' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : ''}
            {reviewStatus === 'unreviewed' ? 'bg-slate-700/40 text-slate-300 border-slate-600/50' : ''}"
          class:restore-pulse={justRestored}
        >
          {#if reviewStatus === "confirmedUnchanged"}
            {$t("scanning.itemCard.statusConfirmedUnchanged")}
          {:else if reviewStatus === "manuallyCorrected"}
            {$t("scanning.itemCard.statusManuallyCorrected")}
          {:else}
            {$t("scanning.itemCard.statusUnreviewed")}
          {/if}
        </span>
      </div>
    </div>
    <div class="flex items-center gap-3">
      {#if totalItems > 0}
        <span class="text-xs text-slate-400 font-mono">
          {$t("scanning.itemCard.itemCounter", { current: currentIndex + 1, total: totalItems })}
        </span>
      {/if}
      <button
        type="button"
        on:click={onOpenGrading}
        class="px-3 py-1.5 text-xs font-medium rounded border border-slate-600 bg-slate-900 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
      >
        <span>{$t("scanning.itemCard.canvasWorkspace")}</span>
        <span>↗</span>
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
    <!-- Left Column: Scan Bubble Crop -->
    <div class="rounded-lg border border-slate-700 bg-slate-900 p-4 flex flex-col items-center justify-center min-h-[320px]">
      <div class="text-xs font-medium text-slate-400 mb-2 w-full flex justify-between">
        <span>{$t("scanning.itemCard.scanCrop")}</span>
        <span class="font-mono text-[0.7rem] text-slate-500">
          {$t("scanning.itemCard.sourceConfidence", { source, confidence })}
        </span>
      </div>

      {#if loadingCrop}
        <div class="text-xs text-slate-400 animate-pulse py-12">{$t("scanning.itemCard.renderingCrop")}</div>
      {:else if cropError}
        <div class="text-xs text-red-400 py-12">{cropError}</div>
      {:else if cropDataUrl}
        <div class="relative w-full overflow-hidden rounded border border-slate-700 bg-white">
          <img
            src={cropDataUrl}
            alt={$t("scanning.itemCard.scanCropAlt", { name: exercise.name || "" })}
            class="max-h-[70vh] w-full object-contain"
          />
        </div>
      {:else}
        <div class="text-xs text-slate-500 italic py-12 text-center">
          {$t("scanning.itemCard.noCrop")}
        </div>
      {/if}
    </div>

    <!-- Right Column: Verification Controls & Options -->
    <div class="flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <div>
            <span class="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              {$t("scanning.itemCard.confirmAnswers")}
            </span>
            <span class="text-[0.7rem] text-slate-400">
              {$t("scanning.itemCard.markedBoxesHelp")}
            </span>
          </div>
          <span class="text-xs font-bold font-mono text-emerald-400">
            {$t("scanning.itemCard.scoreLabel", { score: currentScore, maxPoints: exercise.maxPoints })}
          </span>
        </div>

        {#if confidence === "failed"}
          <div class="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-400">
            {$t("scanning.itemCard.detectionFailed")}
          </div>
        {:else if confidence === "ambiguous"}
          <div class="mb-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
            {$t("scanning.itemCard.ambiguousDetection")}
          </div>
        {/if}

        {#if hasOriginal && !isMatchesOriginal}
          <div class="mb-3 p-2 rounded bg-slate-900/80 border border-slate-700 text-xs text-slate-400">
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
              class="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-150 cursor-pointer select-none
                {isSelected ? 'border-sky-400 bg-sky-400/15 font-semibold' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}
                {isFlagged ? 'border-dashed border-amber-500' : ''}"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isSaving}
                  aria-label={$t("scanning.itemCard.checkboxLabel", { label: letter })}
                  on:click|stopPropagation={() => handleToggleOption(idx)}
                  class="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-400 cursor-pointer pointer-events-auto"
                />
                <span class="font-mono text-xs text-slate-400 font-bold">{letter}.</span>
                <span class="text-slate-200 truncate">{opt}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                {#if isSelected}
                  <span class={isCorrect ? "text-emerald-400 font-bold text-xs" : "text-red-400 font-bold text-xs"}>
                    {isCorrect ? $t("scanning.itemCard.correct") : $t("scanning.itemCard.incorrect")}
                  </span>
                {:else if isCorrect}
                  <span class="text-slate-500 text-[0.7rem]">{$t("scanning.itemCard.keyCorrect")}</span>
                {/if}
                {#if isFlagged}
                  <span class="text-amber-400 font-bold text-xs" title={$t("scanning.itemCard.flaggedTitle")}>?</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <p class="mt-2 text-[0.7rem] text-slate-500">
          {$t("scanning.itemCard.optionShortcutHint", { count: options.length })}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            on:click={handleConfirmAsCorrect}
            disabled={isSaving}
            title={$t("scanning.itemCard.confirmDetectionTooltip")}
            class="px-3 py-1.5 text-xs font-medium rounded border border-emerald-600/50 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            <span>{$t("scanning.itemCard.confirmDetection")}</span>
          </button>
          {#if hasOriginal && !isMatchesOriginal}
            <button
              type="button"
              on:click={handleRestoreOriginal}
              disabled={isSaving}
              title={$t("scanning.itemCard.restoreOriginalTooltip")}
              class="px-3 py-1.5 text-xs font-medium rounded border border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              {$t("scanning.itemCard.restoreOriginal")}
            </button>
          {/if}
        </div>
      </div>

      <!-- Action Navigation Footer -->
      <div class="flex items-center justify-between pt-4 border-t border-slate-700">
        <button
          type="button"
          on:click={onPrev}
          disabled={currentIndex <= 0}
          class="px-4 py-2 text-xs font-medium rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer disabled:opacity-40"
        >
          {$t("scanning.itemCard.previous")}
        </button>

        <button
          type="button"
          on:click={onNext}
          class="px-5 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
        >
          {isLastItem ? $t("scanning.itemCard.backToDashboard") : $t("scanning.itemCard.nextItem")}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  @keyframes restore-pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.5);
    }
    100% {
      box-shadow: 0 0 0 8px rgba(56, 189, 248, 0);
    }
  }
  .restore-pulse {
    animation: restore-pulse 0.6s ease-out;
  }
</style>
