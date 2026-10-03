<script lang="ts">
  import { page } from "$app/stores";
  import { goto, afterNavigate } from "$app/navigation";
  import { onDestroy, onMount, untrack } from "svelte";
  import { browser } from "$app/environment";
  import { get } from "svelte/store";
  import { sessionStore, isUnlocked, awaitSessionReady } from "$lib/stores/session";
  import { t, translate } from "$lib/i18n";
  import {
    computeMcVerificationStats,
    categorizeMcItem,
    type McVerificationStats,
    type McDetectionItem,
    type McQueueCategory,
  } from "$lib/grading/mcVerification";
  import { loadExamMcExercises } from "$lib/grading/mcExerciseHash";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { scoreRepository } from "$lib/repositories/scoreRepository";
  import { decrypt } from "$lib/crypto/aesGcm";
  import type { ExerciseRecord, ExerciseScoreRecord, OmrScoreMeta } from "$lib/db/schema";
  import McItemVerificationCard from "$lib/components/verify/McItemVerificationCard.svelte";
  import { Alert, PageShell, Modal, Button } from "$lib/components/ui";
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import { flushAll, flushQuestion, stageVerifiedQuestion } from "$lib/services/trainingDonation";

  let examId = $derived($page.params.id || "");
  let submissionId = $derived($page.url.searchParams.get("submissionId") || "");
  let exerciseId = $derived($page.url.searchParams.get("exerciseId") || "");
  let queueFilter = $derived($page.url.searchParams.get("queue") || "all");

  let loading = $state(true);
  let errorMsg = $state("");

  // Raw: score records, scan bytes and exercises flow back into scoreRepository and the training donation.
  let stats: McVerificationStats | null = null;
  let currentExercise: ExerciseRecord | null = $state.raw(null);
  let currentScoreRecord: ExerciseScoreRecord | null = $state.raw(null);
  let currentExerciseLabel = $state("");
  let currentNeighbourRects: Array<[number, number, number, number]> = $state.raw([]);
  let studentLabel = $state("");
  let scanPdfBytes: Uint8Array | null = $state.raw(null);

  interface StudentQueueItem {
    exerciseId: string;
    exerciseLabel: string;
    category: McQueueCategory;
    isReviewed: boolean;
  }

  let activeQueueItems: McDetectionItem[] = $state.raw([]);
  let currentIndex = $state(-1);
  let lastLoadToken = 0;
  let lastLoadedKey = "";
  let studentTotal = $state(1);
  let studentReviewed = $state(0);
  let studentItems: StudentQueueItem[] = $state.raw([]);
  let showEndOfQueueModal = $state(false);

  let currentItemKey = $derived(`${examId}:${submissionId}:${exerciseId}:${queueFilter}:${$sessionStore.sessionKey ? "unlocked" : "locked"}`);
  $effect.pre(() => {
    const key = currentItemKey;
    if (browser && examId && submissionId && exerciseId && $sessionStore.sessionKey && key !== lastLoadedKey) {
      lastLoadedKey = key;
      untrack(loadItemData);
    }
  });

  afterNavigate(() => {
    if (examId && submissionId && exerciseId && $sessionStore.sessionKey && currentItemKey !== lastLoadedKey) {
      lastLoadedKey = currentItemKey;
      loadItemData();
    }
  });

  onMount(async () => {
    await awaitSessionReady();
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
  });

  async function loadItemData() {
    if (!examId || !submissionId || !exerciseId) return;
    const thisToken = ++lastLoadToken;
    loading = true;
    errorMsg = "";

    try {
      const key = get(sessionStore).sessionKey;
      const [verificationStats, exercises, submission] = await Promise.all([
        computeMcVerificationStats(examId, key),
        loadExamMcExercises(examId, key),
        submissionRepository.getById(examId, submissionId, key),
      ]);

      if (thisToken !== lastLoadToken) return;

      const exercise = exercises.find((e) => e.id === exerciseId) || null;
      if (!exercise) {
        errorMsg = translate("scanning.verifyItem.exerciseNotFound");
        loading = false;
        return;
      }

      if (!submission) {
        errorMsg = translate("scanning.verifyItem.submissionNotFound");
        loading = false;
        return;
      }

      let nextScanPdfBytes: Uint8Array | null = null;
      if (submission.scanCt && submission.scanIv) {
        try {
          nextScanPdfBytes = await decrypt(key, submission.scanCt, submission.scanIv);
        } catch (err) {
          console.warn("Failed to decrypt scan PDF:", err);
          nextScanPdfBytes = null;
        }
      }

      if (thisToken !== lastLoadToken) return;

      const scores = await scoreRepository.getBySubmissionId(examId, submissionId, key);
      if (thisToken !== lastLoadToken) return;

      stats = verificationStats;

      if (queueFilter === "failed" || queueFilter === "unsure" || queueFilter === "confident") {
        activeQueueItems = stats.items.filter((i) => categorizeMcItem(i) === queueFilter);
      } else {
        // Legacy/malformed URL fallback only — app code always sends an explicit category now.
        activeQueueItems = stats.items;
      }

      currentIndex = activeQueueItems.findIndex(
        (i) => i.submissionId === submissionId && i.exerciseId === exerciseId
      );

      currentExercise = exercise;

      const matchingItem = stats.items.find(
        (i) => i.submissionId === submissionId && i.exerciseId === exerciseId
      );
      studentLabel =
        matchingItem?.studentLabel ||
        translate("scanning.verifyItem.submissionLabelFallback", { shortId: submissionId.slice(0, 8) });

      // Scoped to the current category, so the header badge matches the
      // per-category count shown on the dashboard row this item was opened from.
      const studentItemsInCategory = activeQueueItems.filter((i) => i.submissionId === submissionId);
      studentTotal = studentItemsInCategory.length;
      studentReviewed = studentItemsInCategory.filter((i) => i.isReviewed).length;

      // Deliberately unfiltered by category — this powers the "jump to this
      // student's other MC items" list, which must reach across categories.
      studentItems = stats.items
        .filter((i) => i.submissionId === submissionId)
        .map((i) => ({
          exerciseId: i.exerciseId,
          exerciseLabel: i.exerciseLabel,
          category: categorizeMcItem(i),
          isReviewed: !!i.isReviewed,
        }));

      scanPdfBytes = nextScanPdfBytes;
      currentScoreRecord = scores.find((s) => s.exerciseId === exerciseId) || null;
      currentExerciseLabel = matchingItem?.exerciseLabel || "";
      // Other exercises' boxes on the same page bound the crop, so it can't show a
      // neighbouring sub-question as if it were this one.
      const ownPage = currentScoreRecord?.omrMeta?.detections?.pageIndex;
      currentNeighbourRects = scores
        .filter((s) => s.exerciseId !== exerciseId && s.omrMeta?.detections?.pageIndex === ownPage)
        .flatMap((s) => s.omrMeta!.detections!.bubbles.map((b) => b.rect));
    } catch (err: any) {
      if (thisToken !== lastLoadToken) return;
      console.error("Failed to load MC verification item:", err);
      errorMsg = err.message || translate("scanning.verifyItem.loadError");
    } finally {
      if (thisToken === lastLoadToken) {
        loading = false;
      }
    }
  }

  async function handleSave(
    exId: string,
    nextSelectedOptions: number[],
    nextScore: number,
    nextOmrMeta: OmrScoreMeta
  ) {
    if (!submissionId) return;
    const key = get(sessionStore).sessionKey;
    const scoreToSave: ExerciseScoreRecord = {
      id: currentScoreRecord?.id ?? crypto.randomUUID(),
      submissionId,
      exerciseId: exId,
      score: nextScore,
      selectedOptions: nextSelectedOptions,
      omrMeta: nextOmrMeta,
    };

    await scoreRepository.saveOne(examId, scoreToSave, key);
    currentScoreRecord = scoreToSave;
    // Opt-in training-data donation: only staged here, built once the teacher moves on.
    stageVerifiedQuestion(examId, scoreToSave, scanPdfBytes);
  }

  /** The teacher leaves the current question — donate it if it was verified (opt-in). */
  function leaveCurrentQuestion() {
    if (submissionId && exerciseId) void flushQuestion(submissionId, exerciseId);
  }

  onDestroy(() => {
    void flushAll();
  });

  function goBackToDashboard() {
    leaveCurrentQuestion();
    goto(`/exam/${examId}/verify?queue=${queueFilter}`);
  }

  function handleNext() {
    leaveCurrentQuestion();
    if (currentIndex >= 0 && currentIndex < activeQueueItems.length - 1) {
      const nextItem = activeQueueItems[currentIndex + 1];
      goto(
        `/exam/${examId}/verify-item?submissionId=${nextItem.submissionId}&exerciseId=${nextItem.exerciseId}&queue=${queueFilter}`
      );
    } else {
      goBackToDashboard();
    }
  }

  function handleEndOfQueue() {
    showEndOfQueueModal = true;
  }

  function handlePrev() {
    leaveCurrentQuestion();
    if (currentIndex > 0) {
      const prevItem = activeQueueItems[currentIndex - 1];
      goto(
        `/exam/${examId}/verify-item?submissionId=${prevItem.submissionId}&exerciseId=${prevItem.exerciseId}&queue=${queueFilter}`
      );
    }
  }

  function handleOpenGrading() {
    leaveCurrentQuestion();
    goto(`/exam/${examId}/grade?submissionId=${submissionId}&exerciseId=${exerciseId}`);
  }

  function navigateToItem(targetExerciseId: string, category: McQueueCategory) {
    leaveCurrentQuestion();
    goto(
      `/exam/${examId}/verify-item?submissionId=${submissionId}&exerciseId=${targetExerciseId}&queue=${category}`
    );
  }
</script>

<PageShell width="fluid">
  <div class="mb-4 flex items-center justify-between">
    <Button variant="text" severity="secondary" size="sm" icon={faArrowLeft} href={`/exam/${examId}/verify`}>
      {$t("scanning.verifyItem.backLink")}
    </Button>
  </div>

  {#if loading}
    <div class="p-12 text-center text-sm text-muted">{$t("scanning.verifyItem.loading")}</div>
  {:else if errorMsg}
    <Alert severity="danger" class="mx-auto max-w-xl">{errorMsg}</Alert>
  {:else if currentExercise}
    <McItemVerificationCard
      exercise={currentExercise}
      {studentLabel}
      {submissionId}
      {studentTotal}
      {studentReviewed}
      {studentItems}
      currentExerciseId={exerciseId}
      scoreRecord={currentScoreRecord}
      exerciseLabel={currentExerciseLabel}
      neighbourRects={currentNeighbourRects}
      {scanPdfBytes}
      currentIndex={currentIndex >= 0 ? currentIndex : 0}
      totalItems={activeQueueItems.length}
      onSave={handleSave}
      onNext={handleNext}
      onPrev={handlePrev}
      onEndOfQueue={handleEndOfQueue}
      onOpenGrading={handleOpenGrading}
      onNavigateToItem={navigateToItem}
    />
  {/if}

  <Modal
    open={showEndOfQueueModal}
    size="small"
    title={$t("scanning.itemCard.endOfQueueTitle")}
    onClose={() => (showEndOfQueueModal = false)}
  >
    <p class="text-sm text-content">{$t("scanning.itemCard.endOfQueueMessage")}</p>
    {#snippet footer()}
      <Button onClick={goBackToDashboard}>{$t("scanning.itemCard.backToDashboard")}</Button>
    {/snippet}
  </Modal>
</PageShell>
