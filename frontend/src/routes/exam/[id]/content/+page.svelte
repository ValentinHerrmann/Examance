<script lang="ts">
  // The Exam step (issue #212): arrange exercises and MC groups, set the print layout and check both in the preview, on one page.
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { browser } from "$app/env";
  import { beforeNavigate, goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { db } from "#lib/db/db";
  import type { ExamRecord, ExerciseRecord, ExtraNotes } from "#lib/db/schema";
  import { saveExamEncrypted, type McGroup } from "#lib/db/dbEncryption";
  import { loadExamCompileContext, type ExamItemRef } from "#lib/grading/omrTemplatePrep";
  import { prunePageBreaks, togglePageBreak } from "#lib/exam/pageBreaks";
  import { computeExamItems } from "#lib/exam/examItems";
  import { loadExamData, loadLibraryExercises, type ExamLoadTarget } from "#lib/exam/loadExam";
  import { api } from "#lib/api/client";
  import { sessionStore, isAuthenticated, awaitSessionReady } from "#lib/stores/session";
  import { minWidth } from "#lib/stores/viewport";
  import { takeUrlParam } from "#lib/utils/urlToken";
  import ExerciseList from "#lib/components/exam/ExerciseList.svelte";
  import ExamExercisePicker from "#lib/components/exam/ExamExercisePicker.svelte";
  import ExamPreviewPanel from "#lib/components/exam/ExamPreviewPanel.svelte";
  import ExamLayoutSettings from "#lib/components/exam/ExamLayoutSettings.svelte";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, Card, ConfirmDialog, PageShell, Tabs } from "#lib/components/ui";
  import { faEye, faLayerGroup, faSliders } from "@fortawesome/free-solid-svg-icons";

  let examId = $derived(page.params.id || "");

  // Raw: these records go to Dexie, encryption, the API and buildExamLinkPayload(); update immutably.
  let exam: ExamRecord | null = $state.raw(null);
  let exercises: ExerciseRecord[] = $state.raw([]);
  let libraryExercises: ExerciseRecord[] = $state.raw([]);
  let mcGroups: McGroup[] = $state.raw([]);
  let examItems: ExamItemRef[] = $state.raw([]);
  let errorMsg = $state("");
  let isLocalFallback = $state(false);
  let loaded = $state(false);
  // Bumped by every edit that changes the printed exam; the preview panel marks itself outdated.
  let layoutVersion = $state(0);

  // Wide screens show the preview next to the editor; narrow ones get it as a third tab.
  const isXl = minWidth("xl", true);
  type ContentTab = "exercises" | "layout" | "preview";
  let tab = $state<ContentTab>("exercises");
  let shownTab: ContentTab = $derived(tab === "preview" && $isXl ? "exercises" : tab);
  let layoutDirty = $state(false);
  let pendingLeave: URL | null = $state(null);

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
      if (!isStale()) loaded = true;
    } catch (err) {
      console.error("Failed to load exam from DB:", err);
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

  function afterLayoutChange() {
    layoutVersion++;
  }

  // Quick exercise editor (opened from exercise names and the library picker).
  let quickEditEx: ExerciseRecord | null = $state.raw(null);
  let creatingExercise = $state(false);
  let picker: ReturnType<typeof ExamExercisePicker> | undefined = $state();

  /** Reload via loadExam so the junction fields (group, sub-index, order) stay intact; a new exercise from the library dialog joins the library list and the selection (M1). */
  async function handleEditorSaved({ exercise }: { exercise: ExerciseRecord }) {
    if (!creatingExercise) return loadExam(examId);
    creatingExercise = false;
    picker?.addCreatedExercise(exercise);
  }

  async function removeMcGroup(groupId: string) {
    mcGroups = mcGroups.filter((g) => g.id !== groupId);
    await saveExerciseLinks();
  }

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

  async function removeExerciseLink(id: string) {
    exercises = exercises.filter((ex) => ex.id !== id);
    examItems = examItems.filter((item) => !(item.type === "exercise" && item.id === id));
    await saveExerciseLinks();
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
        examExerciseRecords.push({ examId: currentExamId, exerciseId: item.id, orderIndex: order });
        order++;
      } else if (item.type === "mc_group") {
        const group = mcGroups.find((g) => g.id === item.id);
        if (!group) continue;
        mcGroupsPayload.push({ id: group.id, title: group.title, scoring_text: group.scoringText, order_index: order });
        mcGroupRecords.push({ id: group.id, examId: currentExamId, title: group.title, scoringText: group.scoringText, orderIndex: order });
        let subIndex = 1;
        for (const exId of group.memberIds) {
          if (linkedExerciseIds.has(exId)) continue;
          linkedExerciseIds.add(exId);
          exerciseLinksPayload.push({ exercise_id: exId, order_index: order, mc_group_id: group.id, sub_index: subIndex });
          examExerciseRecords.push({ examId: currentExamId, exerciseId: exId, orderIndex: order, mcGroupId: group.id, subIndex });
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
    const { mcGroupsPayload, exerciseLinksPayload, mcGroupRecords, examExerciseRecords, items } = buildExamLinkPayload();
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
        if (mcGroupRecords.length > 0) await db.examMcGroups.bulkPut(mcGroupRecords);
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
        { mc_groups: mcGroupsPayload, exercise_links: exerciseLinksPayload, ...(breaksChanged ? { page_breaks: pageBreaks } : {}) },
        { silentError: true },
      );
      errorMsg = "";
    } catch (err) {
      console.error("Failed to sync exercise links to server:", err);
      errorMsg = translate("exam.page.exerciseLinks.saveFailed");
    }
    afterLayoutChange();
  }

  // Unsaved layout edits: ask before leaving the page (in-app navigation; a closed tab loses them like any form).
  beforeNavigate((nav) => {
    if (!layoutDirty || !nav.to || nav.type === "leave") return;
    nav.cancel();
    pendingLeave = nav.to.url;
  });

  let tabItems = $derived([
    { id: "exercises", label: $t("exam.content.tabExercises"), icon: faLayerGroup, count: exercises.length || undefined },
    { id: "layout", label: $t("exam.content.tabLayout"), icon: faSliders },
    ...($isXl ? [] : [{ id: "preview", label: $t("exam.content.tabPreview"), icon: faEye }]),
  ]);
  let effectiveItems = $derived(computeExamItems(examItems, exercises, mcGroups));

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
        loaded = false;
        await loadExam(id);
        // A just-created exam ("New exam") opens with the library (M1).
        if (exam && takeUrlParam("library") === "open") await picker?.open();
      });
    }
  });
</script>

<PageShell width="fluid">
  <ExamPageHeader {examId} step="content" title={$t("exam.sidebar.content")} helpTopic="examCreation" />

  {#if isLocalFallback}
    <Alert severity="warning" class="mb-6">{$t("exam.page.localFallback.banner")}</Alert>
  {/if}

  {#if exercises.some((ex) => ex.codeWithheld)}
    <!-- Imported from another teacher's results-only archive: grading and statistics work, compiling doesn't. -->
    <Alert severity="info" title={$t("exam.resultsOnly.badge")} class="mb-6">{$t("exam.resultsOnly.noCompile")}</Alert>
  {/if}

  {#if errorMsg}
    <Alert severity="danger" class="mb-6">{errorMsg}</Alert>
  {/if}

  {#if !exam}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div class="flex min-w-0 flex-col gap-4 {shownTab === 'preview' ? 'hidden xl:flex' : ''}">
        <Tabs items={tabItems} value={shownTab} label={$t("exam.content.tabsLabel")} onChange={(id) => (tab = id as typeof tab)} />
        <!-- Both panels stay mounted, so switching tabs keeps unsaved layout edits. -->
        <div class={shownTab === "exercises" ? "" : "hidden"}>
          <ExerciseList
            {exercises}
            {mcGroups}
            {libraryExercises}
            {examItems}
            onRemove={removeExerciseLink}
            onAddExercises={() => picker?.open()}
            onMoveUp={(idx) => moveExamItem(idx, "up")}
            onMoveDown={(idx) => moveExamItem(idx, "down")}
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
        <div class={shownTab === "layout" ? "" : "hidden"}>
          <Card title={$t("exam.content.tabLayout")}>
            <ExamLayoutSettings
              {exam}
              {exercises}
              bind:dirty={layoutDirty}
              onSaved={(updated) => {
                exam = updated;
                afterLayoutChange();
              }}
            />
          </Card>
        </div>
      </div>

      <div class="min-w-0 xl:sticky xl:top-4 {shownTab === 'preview' ? '' : 'hidden xl:block'}">
        {#if shownTab === "preview"}
          <Tabs items={tabItems} value={shownTab} label={$t("exam.content.tabsLabel")} onChange={(id) => (tab = id as typeof tab)} class="mb-4 xl:hidden" />
        {/if}
        <ExamPreviewPanel
          {exam}
          {exercises}
          {libraryExercises}
          {mcGroups}
          examItems={effectiveItems}
          {loaded}
          {layoutVersion}
          refreshSources={refreshExamSources}
        />
      </div>
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

<ConfirmDialog
  open={pendingLeave !== null}
  title={$t("exam.content.unsavedTitle")}
  message={$t("exam.content.unsavedMessage")}
  confirmText={$t("exam.content.unsavedLeave")}
  cancelText={$t("exam.content.unsavedStay")}
  onConfirm={() => {
    const to = pendingLeave;
    pendingLeave = null;
    layoutDirty = false;
    if (to) void goto(to);
  }}
  onCancel={() => (pendingLeave = null)}
/>
