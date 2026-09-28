<script lang="ts">
  import { goto, afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { get } from "svelte/store";
  import { sessionStore, isUnlocked, awaitSessionReady } from "$lib/stores/session";
  import { t, translate } from "$lib/i18n";
  import { Button, PageHeader, PageShell } from "$lib/components/ui";
  import {
    computeMcVerificationStats,
    categorizeMcItem,
    isMcReviewed,
    type McVerificationStats,
    type McDetectionItem,
  } from "$lib/grading/mcVerification";
  import McVerificationOverview from "$lib/components/verify/McVerificationOverview.svelte";
  import McVerificationQueue from "$lib/components/verify/McVerificationQueue.svelte";
  import McDetectionSettingsPanel from "$lib/components/verify/McDetectionSettingsPanel.svelte";
  import McRerunDialog from "$lib/components/verify/McRerunDialog.svelte";
  import { buildOmrScoreRecord, mergeRedetectionIntoVerified } from "$lib/grading/omrResult";
  import { createOmrRun } from "$lib/grading/omrSettings";
  import { omrSettingsStore } from "$lib/stores/omrSettings";
  import { loadPdfjs } from "$lib/pdf/pdfjs";
  import {
    loadOmrTemplateEncrypted,
  } from "$lib/db/dbEncryption";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { loadExamMcExercises, resolveMcExercises, computeMcExercisesHash } from "$lib/grading/mcExerciseHash";
  import { prepareOmrTemplate, loadExamCompileContext } from "$lib/grading/omrTemplatePrep";
  import { restoreOriginalDetection, type McQuestionType } from "$lib/grading/mcScore";
  import { decrypt } from "$lib/crypto/aesGcm";
  import type {
    OmrWorkerRequest,
    OmrWorkerResponse,
    OmrExerciseAnswerKey,
  } from "$lib/workers/omrWorker";
  import type { ExerciseScoreRecord } from "$lib/db/schema";
  import { scoreRepository } from "$lib/repositories/scoreRepository";

  $: examId = $page.params.id || "";

  let stats: McVerificationStats | null = null;
  let loading = true;
  let errorMsg = "";

  let isRerunningMc = false;
  let showRerunDialog = false;
  let rerunMcMessage = "";
  let rerunMcError = "";
  let isResettingReviews = false;
  let resetReviewsMessage = "";
  let resetReviewsError = "";
  let lastRefreshId = 0;
  let lastRefreshedKey = "";

  $: currentRefreshKey = `${examId}:${$sessionStore.sessionKey ? "unlocked" : "locked"}`;
  $: if (browser && examId && $sessionStore.sessionKey && currentRefreshKey !== lastRefreshedKey) {
    lastRefreshedKey = currentRefreshKey;
    refresh();
  }

  afterNavigate(() => {
    if (examId && $sessionStore.sessionKey && currentRefreshKey !== lastRefreshedKey) {
      lastRefreshedKey = currentRefreshKey;
      refresh();
    }
  });

  onMount(async () => {
    await awaitSessionReady();
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
  });

  async function refresh() {
    if (!examId) return;
    const thisRefreshId = ++lastRefreshId;
    loading = true;
    errorMsg = "";
    try {
      const computedStats = await computeMcVerificationStats(examId, get(sessionStore).sessionKey);
      if (thisRefreshId !== lastRefreshId) return;
      stats = computedStats;
    } catch (err: any) {
      if (thisRefreshId !== lastRefreshId) return;
      console.error("Failed to load MC verification data:", err);
      errorMsg = translate("scanning.verify.loadError", { message: err.message || err });
    } finally {
      if (thisRefreshId === lastRefreshId) {
        loading = false;
      }
    }
  }

  function requestRerunMcDetection() {
    if (!examId || isRerunningMc || isResettingReviews) return;
    showRerunDialog = true;
  }

  /**
   * Re-detects every MC question with the current settings. Unverified questions take the new
   * reading. Verified ones (`isMcReviewed`) keep the teacher's answer, score and review — only
   * their recorded detection is refreshed (`mergeRedetectionIntoVerified`), which makes re-runs
   * useful for comparing settings on already-verified sheets (issue #32: settings never change a
   * verified result). Hand-typed scores without a detection are not touched.
   */
  async function handleRerunMcDetection() {
    showRerunDialog = false;
    if (!examId || isRerunningMc || isResettingReviews) return;
    isRerunningMc = true;
    rerunMcMessage = translate("scanning.verify.loadingTemplate");
    rerunMcError = "";

    try {
      const key = get(sessionStore).sessionKey;
      let templateResult = await loadOmrTemplateEncrypted(examId, key);
      let templatePages = templateResult?.payload?.pages;
      let templateHash = templateResult?.record.exercisesHash;
      
      let needsCompile = !templateResult || !templatePages;
      let compileCtx = null;

      if (!needsCompile) {
        compileCtx = await loadExamCompileContext(examId, key);
        if (compileCtx) {
          const mcExercises = resolveMcExercises(compileCtx.exercises, compileCtx.libraryExercises, compileCtx.mcGroups);
          const currentHash = await computeMcExercisesHash(mcExercises, compileCtx.mcGroups);
          if (templateResult!.record.exercisesHash !== currentHash) {
            needsCompile = true;
          }
        }
      }

      if (needsCompile) {
        if (!compileCtx) compileCtx = await loadExamCompileContext(examId, key);
        if (!compileCtx) {
          rerunMcMessage = "";
          rerunMcError = translate("scanning.verify.autoPrepareFailed", { message: translate("scanning.examContextNotFound") });
          return;
        }
        try {
          const compileRes = await prepareOmrTemplate({
            examId,
            exam: compileCtx.exam,
            exercises: compileCtx.exercises,
            libraryExercises: compileCtx.libraryExercises,
            mcGroups: compileCtx.mcGroups,
            key,
            onProgress: (msg) => { rerunMcMessage = `${translate("scanning.verify.autoPreparingTemplate")} - ${msg}`; }
          });
          if (compileRes.status === 'stale') {
             rerunMcMessage = "";
             rerunMcError = translate("scanning.verify.autoPrepareFailed", { message: compileRes.message });
             return;
          }
          templatePages = compileRes.pages;
          templateHash = compileRes.exercisesHash;
        } catch (err: any) {
          rerunMcMessage = "";
          rerunMcError = translate("scanning.verify.autoPrepareFailed", { message: err.message });
          return;
        }
      }
      
      if (!templatePages) {
          rerunMcMessage = "";
          rerunMcError = translate("scanning.verify.noTemplate");
          return;
      }

      const [mcExercises, submissions] = await Promise.all([
        loadExamMcExercises(examId, key),
        // Rerunning OMR detection decrypts every submission's scan below, so
        // (unlike the page's own overview load) this one needs the bytes.
        submissionRepository.getByExamId(examId, key, { includeScans: true }),
      ]);

      if (submissions.length === 0) {
        rerunMcMessage = "";
        rerunMcError = translate("scanning.verify.noSubmissions");
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

      // One settings snapshot for the whole re-run, stamped into every row it writes.
      const omrRun = createOmrRun("rerun", get(omrSettingsStore), templateHash);
      const scanScale = omrRun.params.scanScale;
      let processed = 0;
      let updated = 0;
      let redetectedVerified = 0;
      let alignmentFailures = 0;
      let pagesSkippedNoTemplate = 0;

      try {
        for (const sub of submissions) {
          processed++;
          rerunMcMessage = translate("scanning.verify.processingSubmission", {
            current: processed,
            total: submissions.length,
          });
          if (!sub.scanCt || !sub.scanIv) continue;

          let pdfBytes: Uint8Array;
          try {
            pdfBytes = await decrypt(key, sub.scanCt, sub.scanIv);
          } catch (err) {
            console.warn(`Failed to decrypt scan for submission ${sub.id}:`, err);
            continue;
          }

          const existingScores = await scoreRepository.getBySubmissionId(examId, sub.id, key);
          const existingByExercise = new Map(existingScores.map((s) => [s.exerciseId, s]));

          // Collected across every page of this booklet and written once —
          // a per-result write here was one request per MC question per pupil.
          const rescored: ExerciseScoreRecord[] = [];

          const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
          const pdfDoc = await loadingTask.promise;
          console.log(`[RerunMC] Submission ${sub.id}: scanned PDF has ${pdfDoc.numPages} page(s), OMR template has ${templatePages.length} page(s).`);
          // Pages render at scale 3 now; free pdf.js memory per page and per booklet.
          try {
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
              const pageTemplate = templatePages[pageNum - 1];
              if (!pageTemplate || (pageTemplate.bubbles.length === 0 && pageTemplate.fiducials.length === 0)) {
                pagesSkippedNoTemplate++;
                console.log(`[RerunMC] Submission ${sub.id}, page ${pageNum}: skipped (no template page or empty bubbles/fiducials — pageTemplate=${pageTemplate ? `bubbles=${pageTemplate.bubbles.length},fiducials=${pageTemplate.fiducials.length}` : "undefined"}).`);
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
              pdfPage.cleanup();

              const response = await runOmr({
                type: "OMR_PROCESS",
                imageData,
                pageTemplate,
                scanScale,
                answerKeys,
                params: omrRun.params,
              });
              if (response.type !== "OMR_RESULT") {
                console.warn(
                  `[RerunMC] Submission ${sub.id}, page ${pageNum}: worker returned ${response.type}${
                    response.type === "ERROR" ? ` — ${response.message}` : ""
                  }`
                );
                continue;
              }

              if (response.alignmentFailed) alignmentFailures++;

              for (const r of response.results) {
                const existing = existingByExercise.get(r.exerciseId);
                // Hand-typed scores (no detection at all) are never touched.
                if (existing && !existing.omrMeta && existing.score !== undefined) continue;

                const fresh = buildOmrScoreRecord(r, {
                  id: existing?.id ?? crypto.randomUUID(),
                  submissionId: sub.id,
                  run: omrRun,
                  pageStats: response.pageStats,
                });
                if (existing && isMcReviewed(existing.omrMeta)) {
                  // Verified: the teacher's answer and score stay; only the detection is refreshed,
                  // so the stats show how these settings would have read the sheet.
                  // (Unchanged when this run could not read the question.)
                  const merged = mergeRedetectionIntoVerified(existing, fresh);
                  if (merged !== existing) {
                    rescored.push(merged);
                    redetectedVerified++;
                  }
                } else {
                  rescored.push(fresh);
                  updated++;
                }
              }
            }
          } finally {
            await loadingTask.destroy();
          }

          await scoreRepository.saveMany(examId, sub.id, rescored, key);
        }
      } finally {
        worker.terminate();
      }

      rerunMcMessage =
        translate("scanning.verify.rerunComplete", { updated, processed }) +
        (redetectedVerified > 0
          ? translate("scanning.verify.rerunKeptReviewed", { count: redetectedVerified })
          : "") +
        (alignmentFailures > 0
          ? translate("scanning.verify.rerunAlignmentFailures", { count: alignmentFailures })
          : "") +
        (pagesSkippedNoTemplate > 0
          ? translate("scanning.verify.rerunPagesSkippedNoTemplate", { count: pagesSkippedNoTemplate })
          : "");
      await refresh();
    } catch (err: any) {
      rerunMcError = err.message || translate("scanning.verify.rerunError");
      rerunMcMessage = "";
    } finally {
      isRerunningMc = false;
    }
  }

  async function handleResetAllReviews() {
    if (!examId || isRerunningMc || isResettingReviews) return;
    if (!confirm(translate("scanning.verify.confirmResetAllReviews"))) return;

    isResettingReviews = true;
    resetReviewsMessage = "";
    resetReviewsError = "";

    try {
      const key = get(sessionStore).sessionKey;
      const mcExercises = await loadExamMcExercises(examId, key);
      const exerciseById = new Map(mcExercises.map((e) => [e.id, e]));

      // One read for the whole exam, one write per touched submission.
      const restored = new Map<string, ExerciseScoreRecord[]>();
      for (const sc of await scoreRepository.getByExamId(examId, key)) {
        const ex = exerciseById.get(sc.exerciseId);
        if (!ex || !sc.omrMeta?.original) continue;

        const res = restoreOriginalDetection(
          (ex.questionType as McQuestionType) || "mc",
          ex.correctAnswers ?? [],
          ex.penalty ?? 0,
          ex.maxPoints,
          sc.omrMeta
        );
        if (!res) continue;

        const next = { ...sc, selectedOptions: res.nextSelectedOptions, score: res.nextScore, omrMeta: res.nextOmrMeta };
        restored.set(sc.submissionId, [...(restored.get(sc.submissionId) ?? []), next]);
      }

      let resetCount = 0;
      for (const [submissionId, scores] of restored) {
        await scoreRepository.saveMany(examId, submissionId, scores, key);
        resetCount += scores.length;
      }

      resetReviewsMessage = translate("scanning.verify.resetReviewsComplete", { count: resetCount });
      await refresh();
    } catch (err: any) {
      resetReviewsError = err.message || translate("scanning.verify.resetReviewsError");
    } finally {
      isResettingReviews = false;
    }
  }

  function openInGrading(item: McDetectionItem) {
    goto(`/exam/${examId}/grade?submissionId=${item.submissionId}&exerciseId=${item.exerciseId}`);
  }

  /** Against selection bias in the (future) training data: teachers mostly review flagged
   *  items, so confident readings rarely get checked. Opens a random unverified confident one. */
  function openRandomConfidentItem() {
    const candidates = otherItems.filter((i) => !i.isReviewed);
    if (candidates.length === 0) return;
    openVerifyItem(candidates[Math.floor(Math.random() * candidates.length)], "confident");
  }

  function openVerifyItem(item: McDetectionItem, queueTag: string = "all") {
    goto(`/exam/${examId}/verify-item?submissionId=${item.submissionId}&exerciseId=${item.exerciseId}&queue=${queueTag}`);
  }

  $: failedItems = stats?.items.filter((i) => categorizeMcItem(i) === "failed") ?? [];
  $: unsureItems = stats?.items.filter((i) => categorizeMcItem(i) === "unsure") ?? [];
  $: otherItems = stats?.items.filter((i) => categorizeMcItem(i) === "confident") ?? [];

  // Each queue's badge is scoped to that queue's own items — a student with MC
  // items in several categories gets an independent "reviewed/total" count per
  // category (e.g. "1/1" in confident, "0/1" in unsure), not one combined count
  // repeated identically in every section they appear in.
  function buildStudentProgress(items: McDetectionItem[]) {
    const map = new Map<string, { total: number; reviewed: number }>();
    for (const it of items) {
      const entry = map.get(it.submissionId) ?? { total: 0, reviewed: 0 };
      entry.total += 1;
      if (it.isReviewed) entry.reviewed += 1;
      map.set(it.submissionId, entry);
    }
    return map;
  }
  $: failedProgress = buildStudentProgress(failedItems);
  $: unsureProgress = buildStudentProgress(unsureItems);
  $: confidentProgress = buildStudentProgress(otherItems);
</script>

<PageShell width="wide">
  <PageHeader
    title={$t("scanning.verify.heading")}
    subtitle={$t("scanning.verify.description")}
    helpTopic="scanning"
  >
    <svelte:fragment slot="actions">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleResetAllReviews}
        disabled={isRerunningMc || isResettingReviews || loading}
      >
        {isResettingReviews ? $t("scanning.verify.resettingReviews") : $t("scanning.verify.resetReviews")}
      </Button>
      <Button
        size="sm"
        onClick={requestRerunMcDetection}
        disabled={isRerunningMc || isResettingReviews || loading || !stats}
        loading={isRerunningMc}
      >
        {isRerunningMc ? $t("scanning.verify.rerunning") : $t("scanning.verify.rerun")}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={refresh}
        disabled={loading || isRerunningMc || isResettingReviews}
      >
        {loading ? $t("scanning.verify.refreshing") : $t("scanning.verify.refresh")}
      </Button>
    </svelte:fragment>
  </PageHeader>

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
  {#if resetReviewsMessage}
    <div class="p-3 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 text-xs mb-6">
      {resetReviewsMessage}
    </div>
  {/if}
  {#if resetReviewsError}
    <div class="p-3 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-xs mb-6">
      {resetReviewsError}
    </div>
  {/if}

  {#if loading && !stats}
    <div class="p-8 text-center text-sm text-slate-400">{$t("scanning.verify.loading")}</div>
  {:else if errorMsg}
    <div class="p-4 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-xs mb-6">
      {errorMsg}
    </div>
  {:else if stats}
    {#if stats.totalQuestions === 0}
      <div class="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
        <h3 class="text-base font-semibold text-slate-200 mb-2">{$t("scanning.verify.emptyTitle")}</h3>
        <p class="text-xs text-slate-400 max-w-md mx-auto mb-4">
          {$t("scanning.verify.emptyDescription")}
        </p>
        <div class="flex justify-center gap-3">
          <a
            href={`/exam/${examId}`}
            class="px-3 py-1.5 text-xs font-medium rounded border border-slate-700 bg-slate-900 hover:bg-surface-inset text-slate-200 transition-colors"
          >
            {$t("scanning.verify.examSetup")}
          </a>
          <a
            href={`/exam/${examId}/scan`}
            class="px-3 py-1.5 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors"
          >
            {$t("scanning.verify.goToScan")}
          </a>
        </div>
      </div>
    {:else}
      <McDetectionSettingsPanel
        runs={stats.detectionRuns}
        current={$omrSettingsStore}
        comparison={stats.algorithmComparison}
      />

      <McVerificationOverview {stats} />

      <McVerificationQueue
        title={$t("scanning.verify.queueFailed")}
        items={failedItems}
        studentProgress={failedProgress}
        emptyMessage={$t("scanning.verify.emptyFailed")}
        onVerifyItem={(item) => openVerifyItem(item, "failed")}
        onOpenGrading={openInGrading}
      />

      <McVerificationQueue
        title={$t("scanning.verify.queueUnsure")}
        items={unsureItems}
        studentProgress={unsureProgress}
        emptyMessage={$t("scanning.verify.emptyUnsure")}
        onVerifyItem={(item) => openVerifyItem(item, "unsure")}
        onOpenGrading={openInGrading}
      />

      {#if otherItems.some((i) => !i.isReviewed)}
        <div class="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted">
          <Button variant="secondary" size="sm" onClick={openRandomConfidentItem}>
            {$t("scanning.verify.randomSample")}
          </Button>
          <span>{$t("scanning.verify.randomSampleHint")}</span>
        </div>
      {/if}

      <McVerificationQueue
        title={$t("scanning.verify.queueOther")}
        items={otherItems}
        studentProgress={confidentProgress}
        emptyMessage={$t("scanning.verify.emptyOther")}
        onVerifyItem={(item) => openVerifyItem(item, "confident")}
        onOpenGrading={openInGrading}
      />
    {/if}
  {/if}

  {#if stats}
    <McRerunDialog
      open={showRerunDialog}
      runs={stats.detectionRuns}
      current={$omrSettingsStore}
      unreviewedCount={stats.items.filter((i) => !i.isReviewed).length}
      reviewedCount={stats.items.filter((i) => i.isReviewed).length}
      undetectedScoreCount={stats.undetectedScoreCount}
      onConfirm={handleRerunMcDetection}
      onCancel={() => (showRerunDialog = false)}
    />
  {/if}
</PageShell>
