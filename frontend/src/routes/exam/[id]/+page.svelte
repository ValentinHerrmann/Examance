<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { db } from "#lib/db/db";
  import type { ExamRecord, ExerciseRecord, SubmissionRecord, ExtraNotes } from "#lib/db/schema";
  import { saveExamEncrypted, loadOmrTemplateEncrypted, type McGroup } from "#lib/db/dbEncryption";
  import { resolveMcExercises } from "#lib/grading/mcExerciseHash";
  import {
    computeOmrTemplateHash,
    loadExamCompileContext,
    prepareOmrTemplate,
    type ExamItemRef,
  } from "#lib/grading/omrTemplatePrep";
  import { compileFailure, type CompileFailure } from "#lib/latex/compileError";
  import CompileErrorHelp from "#lib/components/latex/CompileErrorHelp.svelte";
  import { prunePageBreaks, togglePageBreak } from "#lib/exam/pageBreaks";
  import { compileExamPreview, getCurrentExamPreview } from "#lib/exam/examPreview";
  import { loadExamData, loadExamSubmissions, loadLibraryExercises, type ExamLoadTarget } from "#lib/exam/loadExam";
  import { pdfBytesToUrl } from "#lib/latex/pdfPreview";
  import { api } from "#lib/api/client";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { examRepository } from "#lib/repositories/examRepository";
  import { sessionStore, isAuthenticated, awaitSessionReady } from "#lib/stores/session";
  import { get } from "svelte/store";
  import DualPdfPreview from "#lib/components/DualPdfPreview.svelte";
  import LayoutReportButton from "#lib/components/layout-report/LayoutReportButton.svelte";
  import { examReportFiles } from "#lib/layout-report/collect";
  import { goto } from "$app/navigation";
  import { takeUrlParam } from "#lib/utils/urlToken";
  import ExamMetadata from "#lib/components/exam/ExamMetadata.svelte";
  import ExamActionBar from "#lib/components/exam/ExamActionBar.svelte";
  import ExamExportModal from "#lib/components/exam/ExamExportModal.svelte";
  import ExerciseList from "#lib/components/exam/ExerciseList.svelte";
  import ExamMetadataEditDialog from "#lib/components/exam/ExamMetadataEditDialog.svelte";
  import ExamExercisePicker from "#lib/components/exam/ExamExercisePicker.svelte";
  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Card, PageHeader, PageShell } from "#lib/components/ui";

  let examId = $derived(page.params.id || "");

  // Raw: these records go to Dexie, encryption, the API and buildExamLinkPayload(); update immutably.
  let exam: ExamRecord | null = $state.raw(null);
  let exercises: ExerciseRecord[] = $state.raw([]);
  let libraryExercises: ExerciseRecord[] = $state.raw([]);
  let mcGroups: McGroup[] = $state.raw([]);
  let examItems: ExamItemRef[] = $state.raw([]);
  let submissions: SubmissionRecord[] = $state.raw([]);
  // Set when the submission read failed: counts show "–" and "delete all" is off, never "no submissions".
  let submissionsLoadError = $state("");

  let exportOpen = $state(false);

  let isPreviewLoading = $state(false);
  let compileNotice = $state("");
  let errorMsg = $state("");
  // The full LaTeX log of the compile that produced `message` (shown only while errorMsg is that message).
  let compileLog = $state<{ message: string; failure: CompileFailure } | null>(null);
  function rememberCompileLog(message: string, err: unknown) {
    const failure = compileFailure(err);
    compileLog = failure ? { message, failure } : null;
  }

  let isPreparingOmr = $state(false);
  let omrPrepareMessage = $state("");
  let omrTemplateStatus: "none" | "ready" | "stale" | "checking" = $state("checking");

  let previewPdfUrl: string | null = $state(null);
  let previewSolutionPdfUrl: string | null = $state(null);
  let showAngabePreview = $state(true);
  let showLoesungPreview = $state(false);

  /** Shows this session's last compile only if it matches the current sources; an outdated one is recompiled (issue #135). */
  async function restoreCachedPreviews() {
    if (!exam || (exercises.length === 0 && mcGroups.length === 0)) return;
    let cached: Awaited<ReturnType<typeof getCurrentExamPreview>>;
    try {
      cached = await getCurrentExamPreview({
        exam,
        exercises,
        libraryExercises,
        mcGroups,
        examItems: getEffectiveExamItems(),
        key: get(sessionStore).sessionKey,
      });
    } catch {
      return; // e.g. results-only import: nothing to preview
    }
    if (cached === null) {
      // Never compiled in this session; also drops a preview left over from the previously open exam.
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewPdfUrl = previewSolutionPdfUrl = null;
      return;
    }
    if (cached === "stale") {
      await handlePreviewExam();
      return;
    }
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    previewPdfUrl = pdfBytesToUrl(cached.angabe.pdfBytes);
    if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
    previewSolutionPdfUrl = pdfBytesToUrl(cached.loesung.pdfBytes);
  }

  let previewRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** After an edit that changes the printed exam: re-check the OMR template and recompile a shown preview (debounced). */
  function afterLayoutChange() {
    if (exam) void checkOmrTemplateStatus(exam.id);
    if (!previewPdfUrl && !previewSolutionPdfUrl) return;
    if (previewRefreshTimer) clearTimeout(previewRefreshTimer);
    previewRefreshTimer = setTimeout(runPreviewRefresh, 1000);
  }

  function runPreviewRefresh() {
    // A compile in flight used the old sources; try again once it is done.
    previewRefreshTimer = isPreviewLoading ? setTimeout(runPreviewRefresh, 1000) : null;
    if (!previewRefreshTimer) void handlePreviewExam();
  }

  onDestroy(() => {
    if (previewRefreshTimer) clearTimeout(previewRefreshTimer);
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = null;
    }
    if (previewSolutionPdfUrl) {
      URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = null;
    }
  });

  let isLocalFallback = $state(false);

  // Only the newest loadExam() run may write: interleaved runs each delete and re-write this exam's examMcGroups/examExercises rows, which left the local MC groups empty.
  let loadSeq = 0;

  // loadExamData() writes straight into the page state, so a load that fails midway keeps what it had set.
  const loadTarget: ExamLoadTarget = {
    get exam() { return exam; },
    set exam(value) { exam = value; },
    get exercises() { return exercises; },
    set exercises(value) { exercises = value; },
    get mcGroups() { return mcGroups; },
    set mcGroups(value) { mcGroups = value; },
    get examItems() { return examItems; },
    set examItems(value) { examItems = value; },
    get isLocalFallback() { return isLocalFallback; },
    set isLocalFallback(value) { isLocalFallback = value; },
    get errorMsg() { return errorMsg; },
    set errorMsg(value) { errorMsg = value; },
  };

  async function loadExam(id: string) {
    await awaitSessionReady();
    const seq = ++loadSeq;
    const isStale = () => seq !== loadSeq;
    const key = get(sessionStore).sessionKey;
    try {
      if (!(await loadExamData(id, { key, authenticated: $isAuthenticated, isStale }, loadTarget))) return;
      const library = await loadLibraryExercises(key);
      if (library) libraryExercises = library;
      const loadedSubmissions = await loadExamSubmissions(id, key, isStale);
      if (!loadedSubmissions) return;
      submissions = loadedSubmissions.submissions;
      submissionsLoadError = loadedSubmissions.error;
      await checkOmrTemplateStatus(id);
      if (isStale()) return;
      await restoreCachedPreviews();
    } catch (err) {
      console.error("Failed to load exam from DB:", err);
    }
  }

  // Quick exercise editor (opened from exercise names and the library picker).
  let quickEditEx: ExerciseRecord | null = $state.raw(null);
  let creatingExercise = $state(false);
  // Dialog flows that live in components; the page opens them through these refs.
  let metadataDialog: ReturnType<typeof ExamMetadataEditDialog> | undefined = $state();
  let picker: ReturnType<typeof ExamExercisePicker> | undefined = $state();

  /** Reload via loadExam so the junction fields (group, sub-index, order) stay intact. */
  /** A new exercise from the library dialog joins the library list and the selection (M1). */
  async function handleEditorSaved({ exercise }: { exercise: ExerciseRecord }) {
    if (!creatingExercise) return loadExam(examId);
    creatingExercise = false;
    picker?.addCreatedExercise(exercise);
  }

  /** MC exercises in exam order from one merged lookup (`exercises` wins over `libraryExercises`), so the answer-key hash is stable across calls and no spurious "stale" banner appears. */
  function collectMcExercises(): ExerciseRecord[] {
    return resolveMcExercises(exercises, libraryExercises, mcGroups);
  }

  /** Template hash shared with the scan/verify checks (`computeOmrTemplateHash`): answer key plus the printed layout. Detects a stale OMR template; on this page never used to silently regenerate one. */
  async function computeExercisesHash(): Promise<string> {
    if (!exam) return "";
    return computeOmrTemplateHash({ exam, exercises, libraryExercises, mcGroups, examItems: getEffectiveExamItems() });
  }

  async function checkOmrTemplateStatus(id: string) {
    omrTemplateStatus = "checking";
    try {
      const mcExercises = collectMcExercises();
      if (mcExercises.length === 0) {
        omrTemplateStatus = "none";
        return;
      }
      const key = get(sessionStore).sessionKey;
      const existing = await loadOmrTemplateEncrypted(id, key);
      if (!existing || !existing.payload) {
        omrTemplateStatus = "none";
        return;
      }
      const currentHash = await computeExercisesHash();
      omrTemplateStatus = existing.record.exercisesHash === currentHash ? "ready" : "stale";
    } catch (err) {
      console.error("Failed to check OMR template status:", err);
      omrTemplateStatus = "none";
    }
  }

  async function handleDeleteExam() {
    if (!exam) return;
    if (
      !confirm(
        translate("exam.page.delete.confirmMessage", { title: exam.title }),
      )
    )
      return;

    try {
      // One cascade, shared with the dashboard and the repository, so no owned table is missed.
      await examRepository.delete(exam.id);

      window.location.href = "/";
    } catch (err: any) {
      alert(translate("exam.page.delete.failed", { message: err.message }));
    }
  }

  let isDuplicating = $state(false);

  /** A copy with the same exercises and settings but no results (issue #121), opened right away. */
  async function handleDuplicateExam() {
    if (!exam) return;
    isDuplicating = true;
    try {
      const copy = await examRepository.duplicate(exam.id);
      await goto(`/exam/${copy.id}`);
    } catch (err: any) {
      alert(translate("dashboard.duplicateFailed", { message: err?.message ?? "" }));
    } finally {
      isDuplicating = false;
    }
  }

  async function removeMcGroup(groupId: string) {
    mcGroups = mcGroups.filter((g) => g.id !== groupId);
    await saveExerciseLinks();
  }

  /** `quiet`: an exam without MC, whose template only fills score boxes; a failure is logged, not shown. */
  async function handlePrepareOmr(quiet = false) {
    if (!exam) return;
    // Quiet runs reuse the preview just compiled and stay out of the compile button's state.
    if (!quiet) isPreparingOmr = true;
    if (!quiet) errorMsg = "";

    try {
      const result = await prepareOmrTemplate({
        examId: exam.id,
        exam,
        exercises,
        libraryExercises,
        mcGroups,
        examItems,
        key: get(sessionStore).sessionKey,
        onProgress: (msg) => { if (!quiet) omrPrepareMessage = msg; }
      });
      if (quiet) {
        if (result.status === 'stale') console.warn("[PrepareOMR]", result.message);
        return;
      }
      omrTemplateStatus = result.status;
      if (result.status === 'stale') {
        omrPrepareMessage = "";
        errorMsg = result.message;
      } else {
        omrPrepareMessage = result.message;
      }
    } catch (err: any) {
      if (quiet) {
        console.warn("[PrepareOMR]", err);
        return;
      }
      errorMsg = err.message || translate("exam.page.omr.failedGeneric");
      rememberCompileLog(errorMsg, err);
      omrPrepareMessage = "";
    } finally {
      if (!quiet) isPreparingOmr = false;
    }
  }

  /** Reloads exercises and MC groups: they may have been edited elsewhere (another tab, the library) since this page loaded, and compiling the old copies would just hit the compile cache again (issue #135). */
  async function refreshExamSources() {
    if (!exam) return;
    const ctx = await loadExamCompileContext(exam.id, get(sessionStore).sessionKey);
    if (!ctx) return;
    exam = ctx.exam;
    exercises = ctx.exercises;
    mcGroups = ctx.mcGroups;
    libraryExercises = ctx.libraryExercises;
  }

  async function handlePreviewExam() {
    if (!exam || (exercises.length === 0 && mcGroups.length === 0)) return;
    isPreviewLoading = true;
    compileNotice = "";
    errorMsg = "";
    let compileSucceeded = false;

    try {
      await refreshExamSources();
      if (!exam) return;
      const res = await compileExamPreview({
        exam,
        exercises,
        libraryExercises,
        mcGroups,
        examItems,
        key: get(sessionStore).sessionKey,
        onStatus: (status) => {
          if (status === 'downloading') {
            compileNotice = translate("exam.page.preview.loadingCompiler");
          } else if (status === 'compiling') {
            compileNotice = translate("exam.page.preview.compiling");
          }
        },
      });

      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = pdfBytesToUrl(res.angabe.pdfBytes);
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = pdfBytesToUrl(res.loesung.pdfBytes);

      if (res.missingGraphics.length > 0) {
        errorMsg = translate("common.previewMissingGraphic", { name: res.missingGraphics[0] });
      }

      compileNotice = "";
      compileSucceeded = true;
    } catch (err: any) {
      errorMsg = translate("exam.page.preview.failed", {
        message: err.message || translate("exam.page.preview.unknownError"),
      });
      rememberCompileLog(errorMsg, err);
    } finally {
      isPreviewLoading = false;
    }

    // Refresh the scan template after every successful compile so it never drifts from the layout. Without MC it only serves the score boxes (issue #187), so it refreshes quietly.
    if (compileSucceeded && collectMcExercises().length > 0) {
      await handlePrepareOmr();
    } else if (compileSucceeded && exercises.length > 0) {
      await handlePrepareOmr(true);
    }
  }

  let totalPoints = $derived(exercises.reduce((sum, ex) => sum + (ex.maxPoints ?? 0), 0));
  let submissionsCount = $derived(submissions.length);
  let studentsCount = $derived(new Set(submissions.map((s) => s.pseudonymHmac)).size);
  let gradedCount = $derived(
    submissions.filter((s) => typeof s.totalScore === "number" && !isNaN(s.totalScore)).length,
  );

  async function moveExamItem(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= examItems.length) return;
    const copy = [...examItems];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    examItems = copy;
    await saveExerciseLinks();
  }

  /** A break belongs to the item id, so it follows the item through reordering. */
  async function toggleExamPageBreak(itemId: string) {
    if (!exam) return;
    const next = togglePageBreak(exam.pageBreaks, itemId);
    exam = { ...exam, pageBreaks: prunePageBreaks(next, getEffectiveExamItems().map((i) => i.id)) };
    try {
      await saveExamEncrypted(exam, get(sessionStore).sessionKey);
      errorMsg = "";
      afterLayoutChange();
    } catch (err) {
      console.error("Failed to save page breaks:", err);
      errorMsg = translate("exam.page.exerciseLinks.saveFailed");
    }
  }

  async function saveExtraNotes(next: ExtraNotes | null) {
    if (!exam) return;
    exam = { ...exam, extraNotes: next };
    try {
      await saveExamEncrypted(exam, get(sessionStore).sessionKey);
      errorMsg = "";
      afterLayoutChange();
    } catch (err) {
      console.error("Failed to save extra notes:", err);
      errorMsg = translate("exam.page.exerciseLinks.saveFailed");
    }
  }

  async function moveExerciseOrder(index: number, direction: "up" | "down") {
    await moveExamItem(index, direction);
  }

  async function removeExerciseLink(id: string) {
    exercises = exercises.filter((ex) => ex.id !== id);
    examItems = examItems.filter((item) => !(item.type === "exercise" && item.id === id));
    await saveExerciseLinks();
  }

  function computeExamItems(
    current: ExamItemRef[],
    exs: ExerciseRecord[],
    groups: McGroup[],
  ): ExamItemRef[] {
    const validIds = new Set([...exs.map((e) => e.id), ...groups.map((g) => g.id)]);
    const currentItems = current.filter((item) => validIds.has(item.id));
    const currentItemIds = new Set(currentItems.map((item) => item.id));

    const missingExercises = exs
      .filter((e) => !groups.some((g) => g.memberIds.includes(e.id)) && !currentItemIds.has(e.id))
      .map((e) => ({ type: "exercise" as const, id: e.id }));

    const missingGroups = groups
      .filter((g) => !currentItemIds.has(g.id))
      .map((g) => ({ type: "mc_group" as const, id: g.id }));

    return [...currentItems, ...missingExercises, ...missingGroups];
  }

  function getEffectiveExamItems(): ExamItemRef[] {
    return computeExamItems(examItems, exercises, mcGroups);
  }

  interface ExamLinkPayload {
    mcGroupsPayload: any[];
    exerciseLinksPayload: any[];
    mcGroupRecords: any[];
    examExerciseRecords: any[];
    items: ExamItemRef[];
  }

  /** Single builder for both the Dexie records and the server payload. MC group members are emitted only under their group: listing them standalone too duplicated the (exam, exercise) primary key. */
  function buildExamLinkPayload(): ExamLinkPayload {
    const currentExamId = exam?.id ?? "";
    const items = getEffectiveExamItems();
    const mcGroupsPayload: any[] = [];
    const exerciseLinksPayload: any[] = [];
    const mcGroupRecords: any[] = [];
    const examExerciseRecords: any[] = [];
    const linkedExerciseIds = new Set<string>();
    let order = 1;

    for (const item of items) {
      if (item.type === "exercise") {
        if (linkedExerciseIds.has(item.id)) continue;
        linkedExerciseIds.add(item.id);
        exerciseLinksPayload.push({ exercise_id: item.id, order_index: order });
        examExerciseRecords.push({
          examId: currentExamId,
          exerciseId: item.id,
          orderIndex: order,
        });
        order++;
      } else if (item.type === "mc_group") {
        const group = mcGroups.find((g) => g.id === item.id);
        if (!group) continue;
        mcGroupsPayload.push({
          id: group.id,
          title: group.title,
          scoring_text: group.scoringText,
          order_index: order,
        });
        mcGroupRecords.push({
          id: group.id,
          examId: currentExamId,
          title: group.title,
          scoringText: group.scoringText,
          orderIndex: order,
        });
        let subIndex = 1;
        for (const exId of group.memberIds) {
          if (linkedExerciseIds.has(exId)) continue;
          linkedExerciseIds.add(exId);
          exerciseLinksPayload.push({
            exercise_id: exId,
            order_index: order,
            mc_group_id: group.id,
            sub_index: subIndex,
          });
          examExerciseRecords.push({
            examId: currentExamId,
            exerciseId: exId,
            orderIndex: order,
            mcGroupId: group.id,
            subIndex,
          });
          subIndex++;
        }
        order++;
      }
    }

    return { mcGroupsPayload, exerciseLinksPayload, mcGroupRecords, examExerciseRecords, items };
  }

  async function saveExerciseLinks() {
    if (!exam) return;
    const currentExamId = exam.id;
    const { mcGroupsPayload, exerciseLinksPayload, mcGroupRecords, examExerciseRecords, items } =
      buildExamLinkPayload();
    examItems = items;
    // Breaks of removed items go with them; the server is told only when the list changed.
    const pageBreaks = prunePageBreaks(exam.pageBreaks, items.map((i) => i.id));
    const breaksChanged = JSON.stringify(pageBreaks) !== JSON.stringify(exam.pageBreaks ?? null);
    if (breaksChanged) exam = { ...exam, pageBreaks };

    try {
      // One transaction: this is a delete-then-reinsert of the exam's entire link set, and an interruption between the two would leave the exam with zero exercises and zero MC groups.
      await db.transaction("rw", [db.examExercises, db.examMcGroups], async () => {
        await db.examExercises.where("examId").equals(currentExamId).delete();
        await db.examExercises.bulkPut(examExerciseRecords);

        // Groups after the links: exam_exercises rows reference them.
        await db.examMcGroups.where("examId").equals(currentExamId).delete();
        if (mcGroupRecords.length > 0) {
          await db.examMcGroups.bulkPut(mcGroupRecords);
        }
      });
    } catch (err) {
      console.error("Failed to update local exercise links:", err);
      errorMsg = translate("exam.page.exerciseLinks.saveFailed");
      return;
    }

    try {
      // silentError: the failure is reported inline below, and the global HTTP error modal on top of an autosave is pure noise.
      await api.patch(
        `/exams/${currentExamId}`,
        {
          mc_groups: mcGroupsPayload,
          exercise_links: exerciseLinksPayload,
          ...(breaksChanged ? { page_breaks: pageBreaks } : {}),
        },
        { silentError: true },
      );
      errorMsg = "";
    } catch (err) {
      console.error("Failed to sync exercise links to server:", err);
      errorMsg = translate("exam.page.exerciseLinks.saveFailed");
    }
    afterLayoutChange();
  }

  let isDeletingAllSubmissions = false;

  async function handleDeleteAllSubmissions() {
    if (!exam || submissionsLoadError) return;
    if (submissions.length === 0) {
      alert(translate("exam.page.submissions.noneToDelete"));
      return;
    }
    if (
      !confirm(
        translate("exam.page.submissions.confirmDeleteAll", { count: submissions.length }),
      )
    )
      return;

    isDeletingAllSubmissions = true;
    try {
      for (const sub of submissions) {
        await submissionRepository.delete(exam.id, sub.id);
        await studentRepository.delete(sub);
      }
      submissions = await submissionRepository.getByExamId(
        exam.id,
        get(sessionStore).sessionKey,
      );
      alert(translate("exam.page.submissions.allDeleted"));
    } catch (err: any) {
      alert(translate("exam.page.submissions.deleteFailed", { message: err.message }));
    } finally {
      isDeletingAllSubmissions = false;
    }
  }

  // Keeps examItems in step with exercises/mcGroups (drops vanished refs, appends new ones). Shares computeExamItems() with getEffectiveExamItems(), so rendered and stored order agree. Also tracks examItems; it only writes when the result differs, so it settles.
  $effect.pre(() => {
    const items = examItems;
    const nextItems = computeExamItems(items, exercises, mcGroups);
    if (nextItems.length !== items.length || nextItems.some((item, i) => item.id !== items[i]?.id)) {
      untrack(() => (examItems = nextItems));
    }
  });

  $effect.pre(() => {
    const id = examId;
    if (browser && id) {
      untrack(async () => {
        await loadExam(id);
        // A just-created exam ("New exam") opens with the library (M1).
        if (exam && takeUrlParam("library") === "open") await picker?.open();
      });
    }
  });
</script>

{#snippet layoutReport()}
  {#if exam}
    <LayoutReportButton
      kind="exam"
      title={exam.title ?? ""}
      compileError={errorMsg || null}
      disabled={isPreviewLoading}
      collectFiles={() =>
        examReportFiles(
          { exam: exam!, exercises, libraryExercises, mcGroups, examItems, key: get(sessionStore).sessionKey },
          previewPdfUrl,
          previewSolutionPdfUrl
        )}
    />
  {/if}
{/snippet}

<PageShell width="fluid">
  <PageHeader title={$t("exam.sidebar.setup")} />

  {#if isLocalFallback}
    <Alert severity="warning" class="mb-6">
      {$t("exam.page.localFallback.banner")}
    </Alert>
  {/if}

  {#if exercises.some((ex) => ex.codeWithheld)}
    <!-- Imported from another teacher's results-only archive: grading and statistics work, compiling doesn't. -->
    <Alert severity="info" title={$t("exam.resultsOnly.badge")} class="mb-6">
      {$t("exam.resultsOnly.noCompile")}
    </Alert>
  {/if}

  {#if submissionsLoadError}
    <Alert severity="danger" class="mb-6">{submissionsLoadError}</Alert>
  {/if}

  {#if !exam}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <ExamMetadata
      {exam}
      {totalPoints}
      submissionsCount={submissionsLoadError ? null : submissionsCount}
      studentsCount={submissionsLoadError ? null : studentsCount}
      gradedCount={submissionsLoadError ? null : gradedCount}
    />

    <ExamActionBar
      {examId}
      onEdit={() => metadataDialog?.open()}
      onDelete={handleDeleteExam}
      onExport={() => (exportOpen = true)}
      onDeleteAllSubmissions={handleDeleteAllSubmissions}
      onDuplicate={handleDuplicateExam}
      {isDuplicating}
    />

    <ExamMetadataEditDialog
      bind:this={metadataDialog}
      {exam}
      {exercises}
      onExamChange={(next) => (exam = next)}
      onLayoutChange={afterLayoutChange}
    />

    <div class="grid min-w-0 grid-cols-1 items-start gap-6 @6xl:grid-cols-2">
      <Card title={$t("exam.page.compileSection.heading")}>
        <p class="mb-4 text-sm text-muted">
          {$t("exam.page.compileSection.description")}
        </p>

        <div class="flex flex-wrap items-center gap-4">
          <Button
            onClick={handlePreviewExam}
            loading={isPreviewLoading || isPreparingOmr}
            disabled={isPreviewLoading || isPreparingOmr || exercises.length === 0}
            title={$t("exam.page.compileSection.liveTooltip")}
          >
            {isPreviewLoading
              ? $t("exam.page.preview.compilingPreviews")
              : isPreparingOmr
                ? $t("exam.page.omr.preparing")
                : $t("exam.page.preview.liveButton")}
          </Button>
        </div>

        {#if exercises.length === 0 && mcGroups.length === 0}
          <p class="mt-3 text-sm text-muted">{$t("exam.page.compileSection.emptyHint")}</p>
        {/if}

        {#if omrTemplateStatus === "stale"}
          <Alert severity="warning" class="mt-3">
            {$t("exam.page.omr.staleWarning")}
            {#snippet actions()}
              <Button
                size="sm"
                variant="outlined"
                severity="warning"
                onClick={async () => {
                  await refreshExamSources();
                  await handlePrepareOmr();
                }}
                disabled={isPreparingOmr}
              >
                {isPreparingOmr ? $t("exam.page.omr.refreshing") : $t("exam.page.omr.refreshNow")}
              </Button>
            {/snippet}
          </Alert>
        {/if}
        {#if omrPrepareMessage}
          <Alert severity="info" class="mt-3">{omrPrepareMessage}</Alert>
        {/if}

        {#if previewPdfUrl || previewSolutionPdfUrl}
          <div class="mt-4">
            <DualPdfPreview
              {previewPdfUrl}
              {previewSolutionPdfUrl}
              bind:showAngabePreview
              bind:showLoesungPreview
              titleAngabe={$t("exam.page.pdfPreview.titleAngabe")}
              titleLoesung={$t("exam.page.pdfPreview.titleLoesung")}
              height="550px"
              placeholderText={$t("exam.page.pdfPreview.placeholder")}
            >
              {#snippet footer()}{@render layoutReport()}{/snippet}
            </DualPdfPreview>
          </div>
        {/if}

        {#if compileNotice}
          <Alert severity="info" class="mt-3">{compileNotice}</Alert>
        {/if}
        {#if errorMsg}
          <Alert severity="danger" class="mt-4">
            <div class="max-h-72 overflow-auto font-mono break-all whitespace-pre-wrap">{errorMsg}</div>
            {#if compileLog && compileLog.message === errorMsg}<CompileErrorHelp failure={compileLog.failure} class="mt-2" />{/if}
          </Alert>
        {/if}
        {#if errorMsg && !previewPdfUrl && !previewSolutionPdfUrl}
          <div class="mt-2 flex justify-end">{@render layoutReport()}</div>
        {/if}
      </Card>

      <ExerciseList
        {exercises}
        {mcGroups}
        {libraryExercises}
        {examItems}
        onRemove={removeExerciseLink}
        onAddExercises={() => picker?.open()}
        onMoveUp={(idx) => moveExerciseOrder(idx, "up")}
        onMoveDown={(idx) => moveExerciseOrder(idx, "down")}
        onMoveExamItem={moveExamItem}
        onRemoveMcGroup={removeMcGroup}
        onEditMcGroup={(groupId) => picker?.editMcGroup(groupId)}
        pageBreaks={exam.pageBreaks ?? []}
        onTogglePageBreak={toggleExamPageBreak}
        extraNotes={exam.extraNotes ?? null}
        onChangeExtraNotes={saveExtraNotes}
        onOpenExercise={(ex) => (quickEditEx = ex)}
      />
    </div>
  {/if}
</PageShell>

<ExamExercisePicker
  bind:this={picker}
  bind:exercises
  bind:mcGroups
  bind:examItems
  bind:libraryExercises
  onSaveLinks={saveExerciseLinks}
  onQuickEdit={(ex) => (quickEditEx = ex)}
  onNewExercise={() => (creatingExercise = true)}
/>

<ExerciseEditorModal
  isOpen={quickEditEx !== null || creatingExercise}
  editingExercise={quickEditEx}
  onClose={() => {
    quickEditEx = null;
    creatingExercise = false;
  }}
  onSave={handleEditorSaved}
/>

{#if exportOpen}
  <ExamExportModal {examId} examTitle={exam?.title ?? ""} onClose={() => (exportOpen = false)} />
{/if}
