<script lang="ts">
  import { faArrowsRotate, faLayerGroup, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
  import { contentHref } from "#lib/utils/links";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import { goto, afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount, untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { sessionStore, isUnlocked, awaitSessionReady } from "#lib/stores/session";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, EmptyState, PageShell, Spinner, actionIcons } from "#lib/components/ui";
  import {
    computeMcVerificationStats,
    mcQueue,
    summarizeMcCheck,
    isMcReviewed,
    type McVerificationStats,
    type McDetectionItem,
  } from "#lib/grading/mcVerification";
  import McVerificationOverview from "#lib/components/verify/McVerificationOverview.svelte";
  import McVerificationQueue from "#lib/components/verify/McVerificationQueue.svelte";
  import McItemVerificationView from "#lib/components/verify/McItemVerificationView.svelte";
  import { verifyHref } from "#lib/utils/links";
  import McDetectionSettingsPanel from "#lib/components/verify/McDetectionSettingsPanel.svelte";
  import McRerunDialog from "#lib/components/verify/McRerunDialog.svelte";
  import { buildOmrScoreRecord, mergeRedetectionIntoVerified } from "#lib/grading/omrResult";
  import { createOmrRun } from "#lib/grading/omrSettings";
  import { spawnOmrWorker } from "#lib/workers/spawn";
  import { omrSettingsStore } from "#lib/stores/omrSettings";
  import { loadPdfjs } from "#lib/pdf/pdfjs";
  import { openScan } from "#lib/db/dbEncryption";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { loadExamMcExercises } from "#lib/grading/mcExerciseHash";
  import { loadExamCompileContext } from "#lib/grading/omrTemplatePrep";
  import { loadOmrTemplateCandidates, omrPinState, type OmrPinState } from "#lib/grading/omrTemplatePins";
  import { readWithTemplates, withTemplate } from "#lib/grading/omrTemplateChoice";
  import { restoreDetections } from "#lib/grading/mcBulkReview";
  import type {
    OmrWorkerRequest,
    OmrWorkerResponse,
    OmrExerciseAnswerKey,
  } from "#lib/workers/omrWorker";
  import type { ExerciseScoreRecord } from "#lib/db/schema";
  import { scoreRepository } from "#lib/repositories/scoreRepository";
  import { examMcState } from "#lib/stores/shell";
  import McSureCheck from "#lib/components/verify/McSureCheck.svelte";
  import McReviewProgress from "#lib/components/verify/McReviewProgress.svelte";

  let examId = $derived(page.params.id || "");
  // Set = one item (M5, formerly `/verify-item`); the stats below serve both views.
  let submissionId = $derived(page.url.searchParams.get("submissionId") || "");
  let exerciseId = $derived(page.url.searchParams.get("exerciseId") || "");
  let queue = $derived(page.url.searchParams.get("queue") || "all");

  // Raw: computed by lib/grading, replaced wholesale on every refresh.
  let stats = $state.raw<McVerificationStats | null>(null);
  let pinState = $state.raw<OmrPinState | null>(null);
  let loading = $state(true);
  let errorMsg = $state("");

  let isRerunningMc = $state(false);
  let showRerunDialog = $state(false);
  let rerunMcMessage = $state("");
  let rerunMcError = $state("");
  let isResettingReviews = $state(false);
  let resetReviewsMessage = $state("");
  let resetReviewsError = $state("");
  let lastRefreshId = 0;
  let lastRefreshedKey = "";

  // Item changes refresh too, so reviewed counts and queue order follow the teacher's last save.
  let currentRefreshKey = $derived(
    `${examId}:${submissionId}:${exerciseId}:${$sessionStore.sessionKey ? "unlocked" : "locked"}`
  );

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
      void loadPinState(thisRefreshId);
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

  /** The newest pin against the current layout (issue #239); a failed read leaves the note out. */
  async function loadPinState(refreshId: number) {
    try {
      const key = get(sessionStore).sessionKey;
      const ctx = await loadExamCompileContext(examId, key);
      const state = ctx ? await omrPinState(ctx, key) : null;
      if (refreshId === lastRefreshId) pinState = state;
    } catch (err) {
      console.warn("Failed to read the pinned OMR templates:", err);
    }
  }

  function requestRerunMcDetection() {
    if (!examId || isRerunningMc || isResettingReviews) return;
    showRerunDialog = true;
  }

  /** Re-detects every MC question. Verified ones keep answer, score and review; only their detection is refreshed (issue #32). Hand-typed scores without a detection are never touched. */
  async function handleRerunMcDetection() {
    showRerunDialog = false;
    if (!examId || isRerunningMc || isResettingReviews) return;
    isRerunningMc = true;
    rerunMcMessage = translate("scanning.verify.loadingTemplate");
    rerunMcError = "";

    try {
      const key = get(sessionStore).sessionKey;
      // Pins first (issue #239), then the current layout; each submission is re-read with the template it was read with before.
      const compileCtx = await loadExamCompileContext(examId, key);
      const loaded = await loadOmrTemplateCandidates(examId, key, compileCtx, (msg) => {
        rerunMcMessage = `${translate("scanning.verify.autoPreparingTemplate")} - ${msg}`;
      });
      const templates = loaded.candidates;
      if (templates.length === 0) {
        rerunMcMessage = "";
        rerunMcError = translate("scanning.verify.autoPrepareFailed", { message: loaded.currentError ?? loaded.pinsError ?? translate("scanning.examContextNotFound") });
        return;
      }

      const [mcExercises, submissions] = await Promise.all([
        loadExamMcExercises(examId, key),
        // Rerunning OMR detection decrypts every submission's scan below, so (unlike the page's own overview load) this one needs the bytes.
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

      const worker = spawnOmrWorker();
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
      const omrRun = createOmrRun("rerun", get(omrSettingsStore));
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
          if (!sub.scanCt || !sub.scanIv || !key) continue;

          let pdfBytes: Uint8Array;
          try {
            pdfBytes = await openScan(sub.id, sub.scanCt, sub.scanIv, key);
          } catch (err) {
            console.warn(`Failed to decrypt scan for submission ${sub.id}:`, err);
            continue;
          }

          const existingScores = await scoreRepository.getBySubmissionId(examId, sub.id, key);
          const existingByExercise = new Map(existingScores.map((s) => [s.exerciseId, s]));

          // Collected across every page of this booklet and written once — a per-result write here was one request per MC question per pupil.
          const rescored: ExerciseScoreRecord[] = [];

          const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
          const pdfDoc = await loadingTask.promise;
          // The template this submission fit before is tried first.
          let preferred = existingScores.find((s) => s.omrMeta?.run?.templateHash)?.omrMeta?.run?.templateHash;
          // Pages render at scale 3 now; free pdf.js memory per page and per booklet.
          try {
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
              if (!templates.some((t) => { const p = t.payload.pages[pageNum - 1]; return p && (p.bubbles.length > 0 || p.fiducials.length > 0); })) {
                pagesSkippedNoTemplate++;
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

              const read = await readWithTemplates(templates, preferred, pageNum, async (pageTemplate) => {
                const res = await runOmr({ type: "OMR_PROCESS", imageData, pageTemplate, scanScale, answerKeys, params: omrRun.params });
                if (res.type === "OMR_RESULT") return res;
                console.warn(`[RerunMC] Submission ${sub.id}, page ${pageNum}: worker returned ${res.type} — ${res.message}`);
                return null;
              });
              if (!read) continue;
              if (read.fits) preferred = read.template.hash;
              const response = read.res;
              const rowRun = withTemplate(omrRun, read.template);

              if (response.alignmentFailed) alignmentFailures++;

              for (const r of response.results) {
                const existing = existingByExercise.get(r.exerciseId);
                // Hand-typed scores (no detection at all) are never touched.
                if (existing && !existing.omrMeta && existing.score !== undefined) continue;

                const fresh = buildOmrScoreRecord(r, {
                  id: existing?.id ?? crypto.randomUUID(),
                  submissionId: sub.id,
                  run: rowRun,
                  pageStats: response.pageStats,
                });
                if (existing && isMcReviewed(existing.omrMeta)) {
                  // Verified: the teacher's answer and score stay; only the detection is refreshed, so the stats show how these settings would have read the sheet. (Unchanged when this run could not read the question.)
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
      const resetCount = await restoreDetections(examId, get(sessionStore).sessionKey);

      resetReviewsMessage = translate("scanning.verify.resetReviewsComplete", { count: resetCount });
      await refresh();
    } catch (err: any) {
      resetReviewsError = err.message || translate("scanning.verify.resetReviewsError");
    } finally {
      isResettingReviews = false;
    }
  }

  /** Against selection bias in the (future) training data: teachers mostly review flagged items, so confident readings rarely get checked. Opens a random unverified confident one. */
  function openRandomConfidentItem() {
    const candidates = otherItems.filter((i) => !i.isReviewed);
    if (candidates.length === 0) return;
    openVerifyItem(candidates[Math.floor(Math.random() * candidates.length)], "confident");
  }

  function openVerifyItem(item: McDetectionItem, queueTag: string = "all") {
    goto(verifyHref(examId, { submissionId: item.submissionId, exerciseId: item.exerciseId, queue: queueTag }));
  }

  // Each queue's badge counts only that queue's items, so a student gets an independent "reviewed/total" per category instead of one combined count repeated in every section.
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

  let failedItems = $derived(stats ? mcQueue(stats.items, "failed") : []);
  let unsureItems = $derived(stats ? mcQueue(stats.items, "unsure") : []);
  let otherItems = $derived(stats ? mcQueue(stats.items, "confident") : []);
  let failedProgress = $derived(buildStudentProgress(failedItems));
  let unsureProgress = $derived(buildStudentProgress(unsureItems));
  let confidentProgress = $derived(buildStudentProgress(otherItems));

  $effect.pre(() => {
    const key = currentRefreshKey;
    if (browser && examId && $sessionStore.sessionKey && key !== lastRefreshedKey) {
      lastRefreshedKey = key;
      untrack(refresh);
    }
  });

  let summary = $derived(stats ? summarizeMcCheck(stats.items) : null);
  // Step badge: the same counts the layout reads from the scans, kept current while reviewing (issue #212).
  $effect.pre(() => {
    const id = examId;
    const s = summary;
    if (s) untrack(() => examMcState.set({ examId: id, ...s }));
  });
</script>

<PageShell width="fluid">
  {#if submissionId && exerciseId}
    {#if stats}
      <McItemVerificationView {examId} {submissionId} {exerciseId} {queue} {stats} />
    {:else if errorMsg}
      <Alert severity="danger" class="mx-auto max-w-xl">{errorMsg}</Alert>
    {:else}
      <div class="p-12 text-center text-sm text-muted">{$t("scanning.verifyItem.loading")}</div>
    {/if}
  {:else}
    <ExamPageHeader
      {examId}
      step="verify"
      title={$t("scanning.verify.heading")}
      hint={$t("scanning.verify.description")}
      helpTopic="scanning"
    >
      {#snippet actions()}
        <Button
          variant="outlined" severity="secondary"
          size="sm"
          icon={faRotateLeft}
          onClick={handleResetAllReviews}
          disabled={isRerunningMc || isResettingReviews || loading}
        >
          {isResettingReviews ? $t("scanning.verify.resettingReviews") : $t("scanning.verify.resetReviews")}
        </Button>
        <Button
          size="sm"
          icon={actionIcons.compile}
          onClick={requestRerunMcDetection}
          disabled={isRerunningMc || isResettingReviews || loading || !stats}
          loading={isRerunningMc}
        >
          {isRerunningMc ? $t("scanning.verify.rerunning") : $t("scanning.verify.rerun")}
        </Button>
        <Button
          variant="outlined" severity="secondary"
          size="sm"
          icon={faArrowsRotate}
          onClick={refresh}
          disabled={loading || isRerunningMc || isResettingReviews}
        >
          {loading ? $t("scanning.verify.refreshing") : $t("scanning.verify.refresh")}
        </Button>
      {/snippet}
    </ExamPageHeader>

    {#if rerunMcMessage}
      <Alert severity="info" class="mb-6">{rerunMcMessage}</Alert>
    {/if}
    {#if rerunMcError}
      <Alert severity="danger" class="mb-6">{rerunMcError}</Alert>
    {/if}
    {#if resetReviewsMessage}
      <Alert severity="info" class="mb-6">{resetReviewsMessage}</Alert>
    {/if}
    {#if resetReviewsError}
      <Alert severity="danger" class="mb-6">{resetReviewsError}</Alert>
    {/if}

    {#if loading && !stats}
      <div class="p-8 text-center text-sm text-muted"><Spinner class="mr-2" />{$t("scanning.verify.loading")}</div>
    {:else if errorMsg}
      <Alert severity="danger" class="mb-6">{errorMsg}</Alert>
    {:else if stats}
      {#if stats.totalQuestions === 0}
        <EmptyState title={$t("scanning.verify.emptyTitle")} description={$t("scanning.verify.emptyDescription")}>
          {#snippet actions()}
            <Button variant="outlined" severity="secondary" icon={faLayerGroup} href={contentHref(examId)}>{$t("scanning.verify.examSetup")}</Button>
            <Button icon={actionIcons.next} href={`/exam/${examId}/scan`}>{$t("scanning.verify.goToScan")}</Button>
          {/snippet}
        </EmptyState>
      {:else}
        <McReviewProgress class="mb-6" {stats} />

        <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
          <div class="flex min-w-0 flex-col gap-4 xl:order-2">
            {#if summary}
              <McSureCheck
                {examId}
                {summary}
                sureOpen={otherItems.filter((i) => !i.isReviewed)}
                onOpenSample={openRandomConfidentItem}
                onChanged={refresh}
              />
            {/if}
            <McDetectionSettingsPanel runs={stats.detectionRuns} current={$omrSettingsStore} comparison={stats.algorithmComparison} templates={stats.templatesUsed} pin={pinState} />
          </div>

          <div class="min-w-0 xl:order-1">
            <McVerificationQueue
              {examId}
              title={$t("scanning.verify.queueFailed")}
              items={failedItems}
              studentProgress={failedProgress}
              emptyMessage={$t("scanning.verify.emptyFailed")}
              queueTag="failed"
            />
            <McVerificationQueue
              {examId}
              title={$t("scanning.verify.queueUnsure")}
              items={unsureItems}
              studentProgress={unsureProgress}
              emptyMessage={$t("scanning.verify.emptyUnsure")}
              queueTag="unsure"
            />
            <McVerificationQueue
              {examId}
              title={$t("scanning.verify.queueOther")}
              items={otherItems}
              studentProgress={confidentProgress}
              emptyMessage={$t("scanning.verify.emptyOther")}
              queueTag="confident"
            />
          </div>
        </div>

        <McVerificationOverview {stats} />
      {/if}
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
