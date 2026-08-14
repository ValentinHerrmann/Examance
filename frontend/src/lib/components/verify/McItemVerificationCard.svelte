<script lang="ts">
  import { onMount } from "svelte";
  import type { ExerciseRecord, ExerciseScoreRecord, OmrScoreMeta } from "$lib/db/schema";
  import { applyMcCorrection, type McQuestionType } from "$lib/grading/mcScore";
  import { renderMcCrop } from "$lib/grading/mcCropRender";

  export let exercise: ExerciseRecord;
  export let studentLabel: string;
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
  export let onOpenGrading: () => void;

  let selectedOptions: number[] = [];
  let omrMeta: OmrScoreMeta | undefined = undefined;
  let cropDataUrl: string | null = null;
  let loadingCrop = false;
  let cropError = "";
  let isSaving = false;

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

  // Toggling an option rewrites every bubble's `state` field (see
  // applyMcCorrection), producing a new `detections` object each time even
  // though the crop itself — which only depends on page + bubble
  // positions, not their marked/blank state — hasn't changed. Re-rendering
  // it on every click would also fail: loadCrop hands scanPdfBytes to
  // pdf.js, which detaches its ArrayBuffer, so anything past the first call
  // with the same bytes needs a fresh key to even want to re-run.
  $: cropKey = omrMeta?.detections
    ? `${omrMeta.detections.pageIndex}:${omrMeta.detections.bubbles.map((b) => `${b.optionIndex}:${b.rect.join(",")}`).join("|")}`
    : "";

  let lastLoadedCropKey = "";
  $: {
    if (scanPdfBytes && omrMeta?.detections && cropKey && cropKey !== lastLoadedCropKey) {
      lastLoadedCropKey = cropKey;
      loadCrop(scanPdfBytes, omrMeta.detections.pageIndex, omrMeta.detections.bubbles);
    } else if (!cropKey) {
      cropDataUrl = null;
      lastLoadedCropKey = "";
    }
  }

  async function loadCrop(
    pdfBytes: Uint8Array,
    pageIndex: number,
    bubbles: Array<{ optionIndex: number; rect: [number, number, number, number] }>
  ) {
    loadingCrop = true;
    cropError = "";
    try {
      cropDataUrl = await renderMcCrop({
        pdfBytes,
        pageIndex,
        bubbles,
        scale: 3.0,
      });
    } catch (err: any) {
      console.error("Failed to render crop:", err);
      cropError = "Failed to render scan crop.";
    } finally {
      loadingCrop = false;
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
</script>

<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-6 shadow-xl max-w-4xl mx-auto">
  <!-- Top Bar: Header & Counter -->
  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4">
    <div>
      <div class="text-xs font-semibold uppercase tracking-wider text-sky-400">
        Verification • Student: <span class="text-slate-100 font-bold">{studentLabel}</span>
      </div>
      <h3 class="text-lg font-bold text-slate-100 mt-0.5">
        {exercise.name || exercise.title || "MC Exercise"}
      </h3>
    </div>
    <div class="flex items-center gap-3">
      {#if totalItems > 0}
        <span class="text-xs text-slate-400 font-mono">
          Item {currentIndex + 1} of {totalItems}
        </span>
      {/if}
      <button
        type="button"
        on:click={onOpenGrading}
        class="px-3 py-1.5 text-xs font-medium rounded border border-slate-600 bg-slate-900 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
      >
        <span>Canvas Workspace</span>
        <span>↗</span>
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- Left Column: Scan Bubble Crop -->
    <div class="rounded-lg border border-slate-700 bg-slate-900 p-4 flex flex-col items-center justify-center min-h-[220px]">
      <div class="text-xs font-medium text-slate-400 mb-2 w-full flex justify-between">
        <span>Scan Crop</span>
        <span class="font-mono text-[0.7rem] text-slate-500">
          Source: {source} • {confidence}
        </span>
      </div>

      {#if loadingCrop}
        <div class="text-xs text-slate-400 animate-pulse py-12">Rendering scan crop...</div>
      {:else if cropError}
        <div class="text-xs text-red-400 py-12">{cropError}</div>
      {:else if cropDataUrl}
        <div class="relative max-w-full overflow-hidden rounded border border-slate-700 bg-white">
          <img
            src={cropDataUrl}
            alt="Scan Crop for {exercise.name}"
            class="max-h-[300px] w-auto object-contain"
          />
        </div>
      {:else}
        <div class="text-xs text-slate-500 italic py-12 text-center">
          No scan crop available for this item.
        </div>
      {/if}
    </div>

    <!-- Right Column: Verification Controls & Options -->
    <div class="flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Confirm Answers
          </span>
          <span class="text-xs font-bold font-mono text-emerald-400">
            Score: {currentScore} / {exercise.maxPoints} Pkt
          </span>
        </div>

        {#if confidence === "failed"}
          <div class="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-400">
            Detection failed on this scan page. Please manually select the marked options.
          </div>
        {:else if confidence === "ambiguous"}
          <div class="mb-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
            Ambiguous detection — verify that the checked options match the scan crop.
          </div>
        {/if}

        <div class="space-y-2">
          {#each options as opt, idx}
            {@const isSelected = selectedOptions.includes(idx)}
            {@const isCorrect = correctAnswers.includes(idx)}
            {@const isFlagged = flaggedOptions.has(idx)}
            <button
              type="button"
              on:click={() => handleToggleOption(idx)}
              disabled={isSaving}
              class="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-all duration-150 cursor-pointer
                {isSelected ? 'border-sky-400 bg-sky-400/15 font-semibold' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}
                {isFlagged ? 'border-dashed border-amber-500' : ''}"
            >
              <span class="flex-1 text-slate-200">{opt}</span>
              <div class="flex items-center gap-2">
                {#if isSelected}
                  <span class={isCorrect ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                    {isCorrect ? "✓ Correct" : "✗ Incorrect"}
                  </span>
                {:else if isCorrect}
                  <span class="text-slate-500 text-[0.7rem]">(Key: ✓)</span>
                {/if}
                {#if isFlagged}
                  <span class="text-amber-400 font-bold" title="Flagged as uncertain">?</span>
                {/if}
              </div>
            </button>
          {/each}
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
          ← Previous
        </button>

        <button
          type="button"
          on:click={onNext}
          disabled={currentIndex >= totalItems - 1}
          class="px-5 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer disabled:opacity-40"
        >
          Next Item →
        </button>
      </div>
    </div>
  </div>
</div>
