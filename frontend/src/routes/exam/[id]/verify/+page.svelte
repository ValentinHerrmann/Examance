<script lang="ts">
  import { goto, afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { get } from "svelte/store";
  import { sessionStore, isUnlocked } from "$lib/stores/session";
  import {
    computeMcVerificationStats,
    type McVerificationStats,
    type McDetectionItem,
  } from "$lib/grading/mcVerification";
  import McVerificationOverview from "$lib/components/verify/McVerificationOverview.svelte";
  import McVerificationQueue from "$lib/components/verify/McVerificationQueue.svelte";
  import { loadPdfjs } from "$lib/pdf/pdfjs";
  import {
    loadOmrTemplateEncrypted,
    loadScoresEncrypted,
    saveScoreEncrypted,
  } from "$lib/db/dbEncryption";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { loadExamMcExercises } from "$lib/grading/mcExerciseHash";
  import { decrypt } from "$lib/crypto/aesGcm";
  import type {
    OmrWorkerRequest,
    OmrWorkerResponse,
    OmrExerciseAnswerKey,
  } from "$lib/workers/omrWorker";

  $: examId = $page.params.id || "";

  let stats: McVerificationStats | null = null;
  let loading = true;
  let errorMsg = "";

  let isRerunningMc = false;
  let rerunMcMessage = "";
  let rerunMcError = "";

  $: if (browser && examId && $sessionStore.sessionKey) {
    refresh();
  }

  afterNavigate(() => {
    if (examId && $sessionStore.sessionKey) {
      refresh();
    }
  });

  onMount(async () => {
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
    if (examId && $sessionStore.sessionKey) {
      await refresh();
    }
  });

  async function refresh() {
    if (!examId) return;
    loading = true;
    errorMsg = "";
    try {
      stats = await computeMcVerificationStats(examId, get(sessionStore).sessionKey);
    } catch (err: any) {
      console.error("Failed to load MC verification data:", err);
      errorMsg = `Failed to load MC verification data: ${err.message || err}`;
    } finally {
      loading = false;
    }
  }

  async function handleRerunMcDetection() {
    if (!examId || isRerunningMc) return;
    isRerunningMc = true;
    rerunMcMessage = "Loading OMR template...";
    rerunMcError = "";

    try {
      const key = get(sessionStore).sessionKey;
      const templateResult = await loadOmrTemplateEncrypted(examId, key);
      if (!templateResult || !templateResult.payload) {
        rerunMcMessage = "";
        rerunMcError = "No OMR template found — run Prepare OMR on the exam setup page first.";
        return;
      }
      const templatePages = templateResult.payload.pages;

      const [mcExercises, submissions] = await Promise.all([
        loadExamMcExercises(examId, key),
        submissionRepository.getByExamId(examId, key),
      ]);

      if (submissions.length === 0) {
        rerunMcMessage = "";
        rerunMcError = "No submissions ingested yet.";
        return;
      }

      const answerKeys: OmrExerciseAnswerKey[] = mcExercises.map((e) => ({
        exerciseId: e.id,
        questionType: e.questionType as "mc" | "sc" | "tf",
        correctAnswers: e.correctAnswers ?? [],
        penalty: e.penalty ?? 0,
        maxPoints: e.maxPoints,
      }));

      const pdfjsLib = await loadPdfjs();

      const worker = new Worker(new URL("$lib/workers/omrWorker.ts", import.meta.url), {
        type: "module",
      });
      const runOmr = (req: OmrWorkerRequest): Promise<OmrWorkerResponse> =>
        new Promise((resolve, reject) => {
          const onMessage = (event: MessageEvent<OmrWorkerResponse>) => {
            worker.removeEventListener("message", onMessage);
            worker.removeEventListener("error", onError);
            resolve(event.data);
          };
          const onError = (err: ErrorEvent) => {
            worker.removeEventListener("message", onMessage);
            worker.removeEventListener("error", onError);
            reject(err.error || new Error(err.message));
          };
          worker.addEventListener("message", onMessage);
          worker.addEventListener("error", onError);
          worker.postMessage(req);
        });

      const scanScale = 2.0;
      let processed = 0;
      let updated = 0;
      let alignmentFailures = 0;

      try {
        for (const sub of submissions) {
          processed++;
          rerunMcMessage = `Processing submission ${processed}/${submissions.length}...`;
          if (!sub.scanCt || !sub.scanIv) continue;

          let pdfBytes: Uint8Array;
          try {
            pdfBytes = await decrypt(key, sub.scanCt, sub.scanIv);
          } catch (err) {
            console.warn(`Failed to decrypt scan for submission ${sub.id}:`, err);
            continue;
          }

          const existingScores = await loadScoresEncrypted(sub.id, key);
          const existingByExercise = new Map(existingScores.map((s) => [s.exerciseId, s]));

          const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const pageTemplate = templatePages[pageNum - 1];
            if (!pageTemplate || (pageTemplate.bubbles.length === 0 && pageTemplate.fiducials.length === 0)) {
              continue;
            }

            const pdfPage = await pdfDoc.getPage(pageNum);
            const viewport = pdfPage.getViewport({ scale: scanScale });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const response = await runOmr({
              type: "OMR_PROCESS",
              imageData,
              pageTemplate,
              scanScale,
              answerKeys,
            });
            if (response.type !== "OMR_RESULT") continue;

            if (response.alignmentFailed) alignmentFailures++;

            for (const r of response.results) {
              const existing = existingByExercise.get(r.exerciseId);
              if (existing?.omrMeta?.source === "manual") continue;

              const failed = r.confidence === "failed";
              const nonBlankBubbles = r.bubbles.filter((b) => b.state !== "blank" && b.state !== "undone");
              await saveScoreEncrypted(
                {
                  id: existing?.id ?? crypto.randomUUID(),
                  submissionId: sub.id,
                  exerciseId: r.exerciseId,
                  score: failed ? undefined : r.score,
                  selectedOptions: failed ? [] : r.selectedOptions,
                  omrMeta: {
                    confidence: r.confidence,
                    source: "omr",
                    flaggedOptions: r.flaggedOptions.length > 0 ? r.flaggedOptions : undefined,
                    detections:
                      !failed && nonBlankBubbles.length > 0
                        ? {
                            pageIndex: r.pageIndex,
                            bubbles: nonBlankBubbles.map((b) => ({
                              optionIndex: b.optionIndex,
                              state: b.state,
                              rect: b.rect,
                            })),
                          }
                        : undefined,
                  },
                },
                key,
              );
              updated++;
            }
          }
        }
      } finally {
        worker.terminate();
      }

      rerunMcMessage =
        `MC detection re-run complete: ${updated} score(s) updated across ${processed} submission(s).` +
        (alignmentFailures > 0
          ? ` ${alignmentFailures} page(s) failed alignment — those exercises need manual grading.`
          : "");
      await refresh();
    } catch (err: any) {
      rerunMcError = err.message || "Failed to re-run MC detection.";
      rerunMcMessage = "";
    } finally {
      isRerunningMc = false;
    }
  }

  function openInGrading(item: McDetectionItem) {
    goto(`/exam/${examId}/grade?submissionId=${item.submissionId}&exerciseId=${item.exerciseId}`);
  }

  function openVerifyItem(item: McDetectionItem, queueTag: string = "all") {
    goto(`/exam/${examId}/verify-item?submissionId=${item.submissionId}&exerciseId=${item.exerciseId}&queue=${queueTag}`);
  }

  $: failedItems = stats?.items.filter((i) => i.confidence === "failed") ?? [];
  $: unsureItems = stats?.items.filter(
    (i) => i.confidence === "ambiguous" || (i.confidence !== "failed" && i.flaggedOptions.length > 0)
  ) ?? [];
  $: otherItems = stats?.items.filter(
    (i) => i.confidence === "high" && i.flaggedOptions.length === 0
  ) ?? [];
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h2 class="text-xl font-bold text-slate-100">Verify MC Detections</h2>
      <p class="text-xs text-slate-400 mt-1">
        Review automatically detected multiple choice answers. Confirm uncertain readings or jump to manual grading.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        on:click={handleRerunMcDetection}
        disabled={isRerunningMc || loading}
        class="px-3 py-1.5 text-xs font-medium rounded border border-slate-700 bg-sky-700/80 hover:bg-sky-600 text-sky-100 transition-colors cursor-pointer disabled:opacity-50"
      >
        {isRerunningMc ? "Re-running MC detection..." : "🔁 Re-run MC detection"}
      </button>
      <button
        type="button"
        on:click={refresh}
        disabled={loading || isRerunningMc}
        class="px-3 py-1.5 text-xs font-medium rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
      >
        {loading ? "Refreshing..." : "↻ Refresh Data"}
      </button>
    </div>
  </div>

  {#if rerunMcMessage}
    <div class="p-3 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 text-xs mb-6">
      {rerunMcMessage}
    </div>
  {/if}
  {#if rerunMcError}
    <div class="p-3 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-xs mb-6">
      {rerunMcError}
    </div>
  {/if}

  {#if loading && !stats}
    <div class="p-8 text-center text-sm text-slate-400">Loading MC verification data...</div>
  {:else if errorMsg}
    <div class="p-4 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-xs mb-6">
      {errorMsg}
    </div>
  {:else if stats}
    {#if stats.totalQuestions === 0}
      <div class="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
        <h3 class="text-base font-semibold text-slate-200 mb-2">No MC Detections Found</h3>
        <p class="text-xs text-slate-400 max-w-md mx-auto mb-4">
          There are no OMR detection results for this exam yet. Make sure you have prepared OMR on the exam page and ingested scans with MC questions.
        </p>
        <div class="flex justify-center gap-3">
          <a
            href={`/exam/${examId}`}
            class="px-3 py-1.5 text-xs font-medium rounded border border-slate-700 bg-slate-900 hover:bg-slate-750 text-slate-200 transition-colors"
          >
            ← Exam Setup
          </a>
          <a
            href={`/exam/${examId}/scan`}
            class="px-3 py-1.5 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors"
          >
            Go to Scan Ingestion →
          </a>
        </div>
      </div>
    {:else}
      <McVerificationOverview {stats} />

      <McVerificationQueue
        title="a) Failed Detections"
        items={failedItems}
        emptyMessage="No failed detections 🎉"
        onVerifyItem={(item) => openVerifyItem(item, "failed")}
        onOpenGrading={openInGrading}
      />

      <McVerificationQueue
        title="b) Unsure / Ambiguous Detections"
        items={unsureItems}
        emptyMessage="No unsure detections left to confirm 🎉"
        onVerifyItem={(item) => openVerifyItem(item, "unsure")}
        onOpenGrading={openInGrading}
      />

      <McVerificationQueue
        title="c) All Other Detections"
        items={otherItems}
        emptyMessage="No high-confidence detections found."
        onVerifyItem={(item) => openVerifyItem(item, "all")}
        onOpenGrading={openInGrading}
      />
    {/if}
  {/if}
</div>
