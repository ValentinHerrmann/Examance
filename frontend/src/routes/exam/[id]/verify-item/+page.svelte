<script lang="ts">
  import { page } from "$app/stores";
  import { goto, afterNavigate } from "$app/navigation";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { get } from "svelte/store";
  import { sessionStore, isUnlocked } from "$lib/stores/session";
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
  import { loadScoresEncrypted, saveScoreEncrypted } from "$lib/db/dbEncryption";
  import { decrypt } from "$lib/crypto/aesGcm";
  import type { ExerciseRecord, ExerciseScoreRecord, OmrScoreMeta } from "$lib/db/schema";
  import McItemVerificationCard from "$lib/components/verify/McItemVerificationCard.svelte";
  import { PageShell, Modal, Button } from "$lib/components/ui";

  $: examId = $page.params.id || "";
  $: submissionId = $page.url.searchParams.get("submissionId") || "";
  $: exerciseId = $page.url.searchParams.get("exerciseId") || "";
  $: queueFilter = $page.url.searchParams.get("queue") || "all";

  let loading = true;
  let errorMsg = "";

  let stats: McVerificationStats | null = null;
  let currentExercise: ExerciseRecord | null = null;
  let currentScoreRecord: ExerciseScoreRecord | null = null;
  let studentLabel = "";
  let scanPdfBytes: Uint8Array | null = null;

  interface StudentQueueItem {
    exerciseId: string;
    exerciseLabel: string;
    category: McQueueCategory;
    isReviewed: boolean;
  }

  let activeQueueItems: McDetectionItem[] = [];
  let currentIndex = -1;
  let lastLoadToken = 0;
  let lastLoadedKey = "";
  let studentTotal = 1;
  let studentReviewed = 0;
  let studentItems: StudentQueueItem[] = [];
  let showEndOfQueueModal = false;

  $: currentItemKey = `${examId}:${submissionId}:${exerciseId}:${queueFilter}:${$sessionStore.sessionKey ? "unlocked" : "locked"}`;
  $: if (browser && examId && submissionId && exerciseId && $sessionStore.sessionKey && currentItemKey !== lastLoadedKey) {
    lastLoadedKey = currentItemKey;
    loadItemData();
  }

  afterNavigate(() => {
    if (examId && submissionId && exerciseId && $sessionStore.sessionKey && currentItemKey !== lastLoadedKey) {
      lastLoadedKey = currentItemKey;
      loadItemData();
    }
  });

  onMount(async () => {
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

      const scores = await loadScoresEncrypted(submissionId, key);
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

    await saveScoreEncrypted(scoreToSave, key);
    currentScoreRecord = scoreToSave;
  }

  function goBackToDashboard() {
    goto(`/exam/${examId}/verify?queue=${queueFilter}`);
  }

  function handleNext() {
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
    if (currentIndex > 0) {
      const prevItem = activeQueueItems[currentIndex - 1];
      goto(
        `/exam/${examId}/verify-item?submissionId=${prevItem.submissionId}&exerciseId=${prevItem.exerciseId}&queue=${queueFilter}`
      );
    }
  }

  function handleOpenGrading() {
    goto(`/exam/${examId}/grade?submissionId=${submissionId}&exerciseId=${exerciseId}`);
  }

  function navigateToItem(targetExerciseId: string, category: McQueueCategory) {
    goto(
      `/exam/${examId}/verify-item?submissionId=${submissionId}&exerciseId=${targetExerciseId}&queue=${category}`
    );
  }
</script>

<PageShell width="full">
  <div class="mb-6 flex items-center justify-between">
    <a
      href={`/exam/${examId}/verify`}
      class="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
    >
      {$t("scanning.verifyItem.backLink")}
    </a>
  </div>

  {#if loading}
    <div class="p-12 text-center text-sm text-slate-400">{$t("scanning.verifyItem.loading")}</div>
  {:else if errorMsg}
    <div class="p-4 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-xs max-w-xl mx-auto">
      {errorMsg}
    </div>
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
    size="sm"
    title={$t("scanning.itemCard.endOfQueueTitle")}
    onClose={() => (showEndOfQueueModal = false)}
  >
    <p class="text-sm text-content">{$t("scanning.itemCard.endOfQueueMessage")}</p>
    <svelte:fragment slot="footer">
      <Button onClick={goBackToDashboard}>{$t("scanning.itemCard.backToDashboard")}</Button>
    </svelte:fragment>
  </Modal>
</PageShell>
