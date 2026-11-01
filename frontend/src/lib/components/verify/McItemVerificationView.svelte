<script lang="ts">
  // One MC item of the verify route (`/exam/[id]/verify?submissionId=…&exerciseId=…&queue=…`, M5). The route loads the stats once for dashboard and item; this view loads only the item's scan and scores.
  import { goto } from "$app/navigation";
  import { onDestroy, untrack } from "svelte";
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import { t, translate } from "#lib/i18n";
  import { categorizeMcItem, mcQueue, type McQueueCategory, type McVerificationStats } from "#lib/grading/mcVerification";
  import { loadExamMcExercises } from "#lib/grading/mcExerciseHash";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { scoreRepository } from "#lib/repositories/scoreRepository";
  import { openScan } from "#lib/db/dbEncryption";
  import type { ExerciseRecord, ExerciseScoreRecord, OmrScoreMeta } from "#lib/db/schema";
  import McItemVerificationCard from "#lib/components/verify/McItemVerificationCard.svelte";
  import { Alert, Modal, Button } from "#lib/components/ui";
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import { flushAll, flushQuestion, stageVerifiedQuestion } from "#lib/services/trainingDonation";
  import { gradeHref, verifyHref } from "#lib/utils/links";

  interface Props {
    examId: string;
    submissionId: string;
    exerciseId: string;
    /** The queue Next/Prev walk; anything else (legacy URLs) walks every item. */
    queue: string;
    stats: McVerificationStats;
  }

  let { examId, submissionId, exerciseId, queue, stats }: Props = $props();

  let loading = $state(true);
  let errorMsg = $state("");
  // Raw: score records, scan bytes and exercises flow back into scoreRepository and the training donation.
  let currentExercise: ExerciseRecord | null = $state.raw(null);
  let currentScoreRecord: ExerciseScoreRecord | null = $state.raw(null);
  let currentNeighbourRects: Array<[number, number, number, number]> = $state.raw([]);
  let scanPdfBytes: Uint8Array | null = $state.raw(null);
  let showEndOfQueueModal = $state(false);
  let loadToken = 0;

  let activeQueueItems = $derived(
    queue === "failed" || queue === "unsure" || queue === "confident" ? mcQueue(stats.items, queue) : stats.items
  );
  let currentIndex = $derived(
    activeQueueItems.findIndex((i) => i.submissionId === submissionId && i.exerciseId === exerciseId)
  );
  let matchingItem = $derived(stats.items.find((i) => i.submissionId === submissionId && i.exerciseId === exerciseId));
  // Scoped to the queue, so the header badge matches the dashboard row this item was opened from.
  let inQueue = $derived(activeQueueItems.filter((i) => i.submissionId === submissionId));
  // Across queues: the "this student's other MC items" list.
  let studentItems = $derived(
    stats.items
      .filter((i) => i.submissionId === submissionId)
      .map((i) => ({
        exerciseId: i.exerciseId,
        exerciseLabel: i.exerciseLabel,
        category: categorizeMcItem(i),
        isReviewed: !!i.isReviewed,
      }))
  );

  async function loadItem(examId: string, submissionId: string, exerciseId: string) {
    const token = ++loadToken;
    loading = true;
    errorMsg = "";
    try {
      const key = get(sessionStore).sessionKey;
      const [exercises, submission, scores] = await Promise.all([
        loadExamMcExercises(examId, key),
        submissionRepository.getById(examId, submissionId, key),
        scoreRepository.getBySubmissionId(examId, submissionId, key),
      ]);
      const exercise = exercises.find((e) => e.id === exerciseId) ?? null;
      let bytes: Uint8Array | null = null;
      if (submission?.scanCt && submission.scanIv && key) {
        try {
          bytes = await openScan(submission.id, submission.scanCt, submission.scanIv, key);
        } catch (err) {
          console.warn("Failed to decrypt scan PDF:", err);
        }
      }
      if (token !== loadToken) return;
      if (!exercise) errorMsg = translate("scanning.verifyItem.exerciseNotFound");
      else if (!submission) errorMsg = translate("scanning.verifyItem.submissionNotFound");
      currentExercise = exercise;
      scanPdfBytes = bytes;
      currentScoreRecord = scores.find((s) => s.exerciseId === exerciseId) ?? null;
      // Other exercises' boxes on the same page bound the crop, so it can't show a neighbouring sub-question.
      const ownPage = currentScoreRecord?.omrMeta?.detections?.pageIndex;
      currentNeighbourRects = scores
        .filter((s) => s.exerciseId !== exerciseId && s.omrMeta?.detections?.pageIndex === ownPage)
        .flatMap((s) => s.omrMeta!.detections!.bubbles.map((b) => b.rect));
    } catch (err: any) {
      if (token !== loadToken) return;
      console.error("Failed to load MC verification item:", err);
      errorMsg = err.message || translate("scanning.verifyItem.loadError");
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  $effect(() => {
    const ids = [examId, submissionId, exerciseId] as const;
    untrack(() => loadItem(...ids));
  });

  async function handleSave(exId: string, selectedOptions: number[], score: number, omrMeta: OmrScoreMeta) {
    const record: ExerciseScoreRecord = {
      id: currentScoreRecord?.id ?? crypto.randomUUID(),
      submissionId,
      exerciseId: exId,
      score,
      selectedOptions,
      omrMeta,
    };
    await scoreRepository.saveOne(examId, record, get(sessionStore).sessionKey);
    currentScoreRecord = record;
    // Opt-in training-data donation: only staged here, built once the teacher moves on.
    stageVerifiedQuestion(examId, record, scanPdfBytes);
  }

  /** Leaving a question donates it if it was verified (opt-in). */
  function leaveTo(href: string) {
    void flushQuestion(submissionId, exerciseId);
    goto(href);
  }

  onDestroy(() => void flushAll());

  const itemHref = (item: { submissionId: string; exerciseId: string }, q: string = queue) =>
    verifyHref(examId, { submissionId: item.submissionId, exerciseId: item.exerciseId, queue: q });

  function handleNext() {
    const next = activeQueueItems[currentIndex + 1];
    leaveTo(currentIndex >= 0 && next ? itemHref(next) : verifyHref(examId));
  }

  function handlePrev() {
    if (currentIndex > 0) leaveTo(itemHref(activeQueueItems[currentIndex - 1]));
  }
</script>

<div class="mb-4 flex items-center justify-between">
  <Button variant="text" severity="secondary" size="sm" icon={faArrowLeft} onClick={() => leaveTo(verifyHref(examId))}>
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
    studentLabel={matchingItem?.studentLabel ||
      $t("scanning.verifyItem.submissionLabelFallback", { shortId: submissionId.slice(0, 8) })}
    {submissionId}
    studentTotal={inQueue.length}
    studentReviewed={inQueue.filter((i) => i.isReviewed).length}
    {studentItems}
    currentExerciseId={exerciseId}
    scoreRecord={currentScoreRecord}
    exerciseLabel={matchingItem?.exerciseLabel || ""}
    neighbourRects={currentNeighbourRects}
    {scanPdfBytes}
    currentIndex={Math.max(currentIndex, 0)}
    totalItems={activeQueueItems.length}
    onSave={handleSave}
    onNext={handleNext}
    onPrev={handlePrev}
    onEndOfQueue={() => (showEndOfQueueModal = true)}
    onOpenGrading={() => leaveTo(gradeHref(examId, { submissionId, exerciseId }))}
    onNavigateToItem={(targetExerciseId: string, category: McQueueCategory) =>
      leaveTo(itemHref({ submissionId, exerciseId: targetExerciseId }, category))}
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
    <Button onClick={() => leaveTo(verifyHref(examId))}>{$t("scanning.itemCard.backToDashboard")}</Button>
  {/snippet}
</Modal>
