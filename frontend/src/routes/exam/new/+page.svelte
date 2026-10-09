<script lang="ts">
  import { type ExerciseGroup, groupExercises } from "#lib/exercise-library/groupExercises";
  import { onMount, onDestroy, untrack } from "svelte";
  import { db } from "#lib/db/db";
  import { sessionStore, isAuthenticated, awaitSessionReady } from "#lib/stores/session";
  import { effectiveLatexStore } from "#lib/stores/capabilities";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import { loadExercisesEncrypted, saveExerciseEncrypted, encryptExercise } from "#lib/db/dbEncryption";
  import { examRepository } from "#lib/repositories/examRepository";
  import { api } from "#lib/api/client";
  import { parseExerciseScore, formatExerciseLatex, formatMcGroupLatex } from "#lib/latex/scoreParser";
  import { recordValue } from "#lib/utils/recentValues";
  import { compileWithCache, getLatestForSlot, invalidateOwner } from "#lib/latex/compileCache";
  import { resolveCompileLogo } from "#lib/latex/logo";
  import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
  import { get } from "svelte/store";
  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import GradingKeyEditor from "#lib/components/GradingKeyEditor.svelte";
  import { getPresetCutoffs } from "#lib/analytics/gradingKey";
  import type { GradingKeyConfig } from "#lib/db/schema";
  import ExamMetadataForm from "#lib/components/exam-creation/ExamMetadataForm.svelte";
  import ExerciseSelector from "#lib/components/exam-creation/ExerciseSelector.svelte";
  import { mapApiToExerciseRecord } from "#lib/repositories/exerciseRepository";
  import SelectedExercisesList from "#lib/components/exam-creation/SelectedExercisesList.svelte";
  import {
    applyGroup,
    buildMcGroupMembership,
    canFinalizeGroup,
    moveStaged,
    toggleStaged,
    type McGroupDraft,
  } from "#lib/exam/mcGroupStaging";
  import ExamLivePreviewPanel from "#lib/components/exam-creation/ExamLivePreviewPanel.svelte";
  import { exerciseTopicSuggestions, formatExamCourse } from "#lib/utils/examLabel";
  import { t, translate } from "#lib/i18n";
  import { PageShell, PageHeader, Alert, Button } from "#lib/components/ui";

  // This is exam CONTENT written into the `datum` field and printed verbatim in the
  // German exam PDF (see \Datum in the LaTeX preamble below) — not UI copy, so it is
  // deliberately not translated and not routed through the locale formatter.
  const DATUM_DURATION_SUFFIX_DE = " (30 Minuten)";

  // Metadata
  let title = $state("");
  let testart = $state("Kurzarbeit");
  let grade = $state("10");
  let klasse = $state("a");
  let datum = $state(new Date().toLocaleDateString("de-DE") + DATUM_DURATION_SUFFIX_DE);
  let nr = $state("1");
  let fach = $state("Informatik");
  // Organisational only (issue #57): not printed on the PDF, so not part of the LaTeX below.
  let topic = $state("");
  let lehrernachname = $state("");
  let infoText = $state(`\\begin{itemize}
    \\item Die Arbeit wird anonymisiert korrigiert. Trage deine Initialen ins QR-Code-Feld ein.
    \\item Mit Bleistift oder rot/rosa Geschriebenes kann \\textbf{nicht} gewertet werden!
\\end{itemize}`);
  let retentionDays = 365;

  let gradingKey: GradingKeyConfig = $state({
    preset: "linear_50",
    cutoffs: getPresetCutoffs("linear_50"),
  });

  // Library & Selection state
  let libraryExercises: ExerciseRecord[] = $state.raw([]);
  let selectedLibraryIds: string[] = $state.raw([]);

  // MC group staging & finalized groups
  type McGroup = McGroupDraft;

  interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }

  let mcStagingIds: string[] = $state.raw([]);
  let mcGroups: McGroup[] = $state.raw([]);
  let editingMcGroupId: string | null = $state(null);
  let editingMcGroup = $derived(mcGroups.find((g) => g.id === editingMcGroupId) ?? null);
  let mcGroupMembership = $derived(buildMcGroupMembership(mcGroups, editingMcGroupId));
  let examItems: ExamItemRef[] = $state.raw([]);
  let selectedTopicFilter: string = $state("ALL");
  let selectedGradeFilter: string = $state("ALL");
  let selectedSubjectFilter: string = $state("ALL");
  let searchQuery: string = $state("");
  let activeTab: "library" | "mc" | "custom" = $state("library");

  // Quick exercise editor state
  let isQuickEditorOpen = $state(false);
  let editingExerciseForQuickEdit: ExerciseRecord | null = $state.raw(null);

  function openQuickEdit(ex: ExerciseRecord) {
    editingExerciseForQuickEdit = ex;
    isQuickEditorOpen = true;
  }

  async function handleQuickEditSaved() {
    await loadLibrary();
  }

  let activeVariantPerGroup: Record<string, string> = $state.raw({});

  // Inline custom exercise form
  let customName = $state("Custom_Exercise");
  let customTopicTag = $state("_General");
  let customLatexBody = $state(`\\begin{Aufgabe}{Eigene Aufgabe}
Frage hier eingeben... \\BE
\\end{Aufgabe}`);
  let saveCustomToLibrary = $state(true);

  // State
  let draftExamId = "draft-new-exam";
  let isLoading = $state(false);
  let errorMsg = $state("");
  let previewPdfUrl: string | null = $state(null);
  let previewSolutionPdfUrl: string | null = $state(null);
  let showAngabePreview = $state(true);
  let showLoesungPreview = $state(false);
  let isPreviewLoading = $state(false);

  onDestroy(() => {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = null;
    }
    if (previewSolutionPdfUrl) {
      URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = null;
    }
  });

  function restoreCachedPreviews() {
    const angabeCached = getLatestForSlot({ kind: "exam", id: draftExamId, variant: "angabe" });
    if (angabeCached) {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = URL.createObjectURL(new Blob([angabeCached.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" }));
    }
    const loesungCached = getLatestForSlot({ kind: "exam", id: draftExamId, variant: "loesung" });
    if (loesungCached) {
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = URL.createObjectURL(new Blob([loesungCached.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" }));
    }
  }

  let availableTopics = $derived(Array.from(
    new Set(
      libraryExercises
        .map((e) => e.topicTag)
        .filter((t): t is string => Boolean(t)),
    ),
  ).sort());

  let availableGrades = $derived(Array.from(
    new Set(
      libraryExercises
        .map((e) => e.grade)
        .filter((g): g is string => Boolean(g)),
    ),
  ).sort());

  let availableSubjects = $derived(Array.from(
    new Set(
      libraryExercises
        .map((e) => e.subject)
        .filter((s): s is string => Boolean(s)),
    ),
  ).sort());

  let filteredLibrary = $derived(libraryExercises.filter((ex) => {
    const matchesGrade =
      selectedGradeFilter === "ALL" || ex.grade === selectedGradeFilter;
    const matchesSubject =
      selectedSubjectFilter === "ALL" || ex.subject === selectedSubjectFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (ex.name && ex.name.toLowerCase().includes(q)) ||
      (ex.topicTag && ex.topicTag.toLowerCase().includes(q)) ||
      (ex.grade && ex.grade.toLowerCase().includes(q)) ||
      (ex.subject && ex.subject.toLowerCase().includes(q)) ||
      (ex.variantKey && ex.variantKey.toLowerCase().includes(q)) ||
      (ex.latexBody && ex.latexBody.toLowerCase().includes(q));
    return matchesGrade && matchesSubject && matchesSearch;
  }));

  let filteredGroups = $derived(groupExercises(filteredLibrary));
  let totalVariantsCount = $derived(filteredGroups.reduce((acc, g) => acc + g.variants.size, 0));

  let selectedExercises = $derived(selectedLibraryIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e)));

  let mcGroupExercises = $derived(mcGroups.map((g) => ({
    group: g,
    members: g.memberIds
      .map((id) => libraryExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e)),
  })));

  let topicSuggestions = $derived(
    exerciseTopicSuggestions([...selectedExercises, ...mcGroupExercises.flatMap(({ members }) => members)]),
  );

  let totalPoints = $derived(
    selectedExercises.reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    ) +
    mcGroupExercises.reduce(
      (sum, { members }) =>
        sum + members.reduce((s, ex) => s + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0), 0),
      0,
    )
  );

  onMount(() => {
    loadLibrary();
    restoreCachedPreviews();
  });

  async function loadLibrary() {
    await awaitSessionReady();
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated) {
        try {
          const remoteExs = (await api.get("/exercises")) as any[];
          libraryExercises = remoteExs.map(mapApiToExerciseRecord);
          const encryptedExs = await Promise.all(libraryExercises.map(ex => encryptExercise(ex, key)));
          await db.exercises.bulkPut(encryptedExs);
        } catch (apiErr) {
          console.warn("Failed to fetch remote library, using IDB:", apiErr);
          libraryExercises = await loadExercisesEncrypted(key);
        }
      } else {
        libraryExercises = await loadExercisesEncrypted(key);
      }
    } catch (err) {
      console.error("Failed to load exercise library:", err);
    }
  }

  function setGroupVariant(groupId: string, vKey: string) {
    activeVariantPerGroup = { ...activeVariantPerGroup, [groupId]: vKey };
  }

  function toggleLibrarySelection(id: string) {
    if (selectedLibraryIds.includes(id)) {
      selectedLibraryIds = selectedLibraryIds.filter((i) => i !== id);
    } else {
      selectedLibraryIds = [...selectedLibraryIds, id];
    }
  }

  function toggleMcStaging(id: string) {
    mcStagingIds = toggleStaged(mcStagingIds, id, mcGroupMembership);
  }

  function reorderMcStaging(index: number, direction: "up" | "down") {
    mcStagingIds = moveStaged(mcStagingIds, index, direction);
  }

  function finalizeMcGroup(groupTitle: string, scoringText: string) {
    if (!canFinalizeGroup(mcStagingIds)) return;
    const memberIds = new Set(mcStagingIds);
    mcGroups = applyGroup(mcGroups, {
      editingId: editingMcGroupId,
      title: groupTitle,
      scoringText,
      memberIds: mcStagingIds,
    });
    // An exercise is linked to an exam once: as a group member it is no longer standalone.
    selectedLibraryIds = selectedLibraryIds.filter((id) => !memberIds.has(id));
    editingMcGroupId = null;
    mcStagingIds = [];
  }

  function editMcGroup(id: string) {
    const group = mcGroups.find((g) => g.id === id);
    if (!group) return;
    editingMcGroupId = id;
    mcStagingIds = [...group.memberIds];
  }

  function removeMcGroup(id: string) {
    mcGroups = mcGroups.filter((g) => g.id !== id);
    if (editingMcGroupId === id) {
      editingMcGroupId = null;
      mcStagingIds = [];
    }
  }

  function moveExercise(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedLibraryIds.length) return;
    const copy = [...selectedLibraryIds];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    selectedLibraryIds = copy;
  }

  function moveExamItem(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= examItems.length) return;
    const copy = [...examItems];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    examItems = copy;
  }

  async function handleAddCustomExercise() {
    if (!customName.trim()) {
      alert(translate("examCreation.errors.customExerciseNameRequired"));
      return;
    }

    const computedScore = parseExerciseScore(customLatexBody);
    const newEx: ExerciseRecord = {
      id: crypto.randomUUID(),
      teacherId: $sessionStore.email || "local-teacher",
      name: customName,
      topicTag: customTopicTag,
      latexBody: customLatexBody,
      maxPoints: computedScore,
      version: 1,
      questionType: "free_text",
      penalty: 0,
      createdAt: new Date().toISOString(),
    };

    if (saveCustomToLibrary) {
      const key = get(sessionStore).sessionKey;
      // The repository creates it on the server; a second POST would be a 409 (create-only).
      await saveExerciseEncrypted(newEx, key);
      libraryExercises = [...libraryExercises, newEx];
    } else {
      libraryExercises = [...libraryExercises, newEx];
    }

    selectedLibraryIds = [...selectedLibraryIds, newEx.id];
    activeTab = "library";
  }

  async function handleLivePreview() {
    if (selectedExercises.length === 0 && mcGroupExercises.length === 0) {
      alert(translate("examCreation.errors.selectAtLeastOneForPreview"));
      return;
    }

    isPreviewLoading = true;
    errorMsg = "";
    try {
      let exerciseCount = 0;
      const exerciseInputs = examItems
        .map((item) => {
          if (item.type === "exercise") {
            const ex = selectedExercises.find((e) => e.id === item.id);
            if (!ex) return "";
            exerciseCount++;
            return formatExerciseLatex(
              ex.latexBody,
              ex.name || `Aufgabe ${exerciseCount}`,
              ex.id,
            );
          } else {
            const group = mcGroups.find((g) => g.id === item.id);
            if (!group) return "";
            const members = group.memberIds
              .map((id) => libraryExercises.find((e) => e.id === id))
              .filter((e): e is ExerciseRecord => Boolean(e));
            return formatMcGroupLatex(
              members.map((m) => ({ id: m.id, latexBody: m.latexBody || "" })),
              group.title,
              group.scoringText,
            );
          }
        })
        .filter(Boolean)
        .join("\n\n");

      const getPreamble = (options: string) => `\\documentclass[a4paper]{article}
\\usepackage[${options}]{sty/Schulaufgabe}
\\Info{${infoText}}
\\Fach{${fach}}
\\Lehrernachname{${lehrernachname}}
\\usepackage{bbding}
\\usepackage{pifont}
\\usepackage{fontspec}
\\usepackage{framed}
\\usepackage{enumitem}
\\usetikzlibrary{shapes.geometric, arrows}
\\usepackage{sty/tikz-uml}
\\neverindent
\\WarningsOff
\\begin{document}
\\Testart{${testart}}
\\Klasse{${formatExamCourse(grade, klasse)}}
\\Datum{${datum}}
\\Nr{${nr}}

${exerciseInputs}

\\end{document}`;

      const fullTexAngabe = getPreamble("sans,punkte");
      const fullTexLoesung = getPreamble("sans,punkte,antworten");

      const useLocal = $effectiveLatexStore === "local";
      if (useLocal) {
        errorMsg = translate("examCreation.status.compilingPdf");
      }

      // Resource files of every exercise in the draft exam (see
      // lib/latex/resources.ts for the flat-filename rules). The local engine
      // needs the bytes; the server loads its own rows from the exercise ids.
      const collectedResources = await exerciseResourceRepository.collectForCompile(
        [
          ...selectedExercises.map((ex) => ({ id: ex.id, label: ex.name })),
          ...mcGroupExercises.flatMap(({ group, members }) =>
            members.map((ex) => ({ id: ex.id, label: ex.name || group.title }))
          ),
        ],
        get(sessionStore).sessionKey,
        useLocal
      );
      const compileOpts = {
        resources: collectedResources.inline,
        resourceExerciseIds: collectedResources.exerciseIds,
        // The draft is not on the server yet, so it prints the account logo.
        logo: await resolveCompileLogo(null, useLocal),
      };

      const resAngabe = await compileWithCache(
        { kind: "exam", id: draftExamId, variant: "angabe" },
        fullTexAngabe,
        useLocal,
        (status) => {
          if (status === 'downloading') {
            errorMsg = translate("examCreation.status.loadingLocalCompiler");
          } else if (status === 'compiling') {
            errorMsg = translate("examCreation.status.compilingPdf");
          }
        },
        false,
        compileOpts
      );

      const blobAngabe = new Blob([resAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = URL.createObjectURL(blobAngabe);

      const resLoesung = await compileWithCache(
        { kind: "exam", id: draftExamId, variant: "loesung" },
        fullTexLoesung,
        useLocal,
        undefined,
        false,
        compileOpts
      );
      const blobLoesung = new Blob([resLoesung.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = URL.createObjectURL(blobLoesung);

      errorMsg = ""; // clear loading message
    } catch (err: any) {
      errorMsg = err.message || translate("examCreation.errors.previewCompilationFailed");
    } finally {
      isPreviewLoading = false;
    }
  }

  async function handleCreateExam() {
    if (!title.trim()) {
      errorMsg = translate("examCreation.errors.titleRequired");
      return;
    }
    if (selectedLibraryIds.length === 0 && mcGroups.length === 0) {
      errorMsg = translate("examCreation.errors.selectAtLeastOneExercise");
      return;
    }

    // Record metadata inputs to recent values
    if (testart) recordValue("exam.testart", testart);
    if (grade) recordValue("exam.grade", grade);
    if (klasse) recordValue("exam.klasse", klasse);
    if (fach) recordValue("exam.fach", fach);
    if (topic.trim()) recordValue("exam.topic", topic);
    if (lehrernachname) recordValue("exam.lehrernachname", lehrernachname);

    isLoading = true;
    errorMsg = "";
    const examId = crypto.randomUUID();
    const retentionUntil = new Date(Date.now() + retentionDays * 86400000)
      .toISOString()
      .split("T")[0];

    try {
      const examRecord: ExamRecord = {
        id: examId,
        teacherId: $sessionStore.email || "local-teacher",
        title,
        testart,
        grade,
        klasse,
        datum,
        nr,
        fach,
        topic: topic.trim() || undefined,
        lehrernachname,
        infoText,
        gradingKey: $state.snapshot(gradingKey),
        retentionUntil,
        compilationStatus: "pending",
        createdAt: new Date().toISOString(),
      };

      // Save junction links in IDB following examItems order
      let order = 1;
      const examExerciseRecords: any[] = [];
      const examMcGroupRecords: any[] = [];
      const exerciseLinksPayload: any[] = [];
      const mcGroupsPayload: any[] = [];

      for (const item of examItems) {
        if (item.type === "exercise") {
          examExerciseRecords.push({
            examId,
            exerciseId: item.id,
            orderIndex: order,
          });
          exerciseLinksPayload.push({
            exercise_id: item.id,
            order_index: order,
          });
          order++;
        } else if (item.type === "mc_group") {
          const group = mcGroups.find((g) => g.id === item.id);
          if (group) {
            examMcGroupRecords.push({
              id: group.id,
              examId,
              title: group.title,
              scoringText: group.scoringText,
              orderIndex: order,
            });
            mcGroupsPayload.push({
              id: group.id,
              title: group.title,
              scoring_text: group.scoringText,
              order_index: order,
            });
            group.memberIds.forEach((exId, subIdx) => {
              examExerciseRecords.push({
                examId,
                exerciseId: exId,
                orderIndex: order,
                mcGroupId: group.id,
                subIndex: subIdx + 1,
              });
              exerciseLinksPayload.push({
                exercise_id: exId,
                order_index: order,
                mc_group_id: group.id,
                sub_index: subIdx + 1,
              });
            });
            order++;
          }
        }
      }

      // One create-only POST with the links: a second POST is a 409 and the links were lost with it.
      await examRepository.create(examRecord, { exercise_links: exerciseLinksPayload, mc_groups: mcGroupsPayload });

      await db.examExercises.bulkPut(examExerciseRecords);
      if (examMcGroupRecords.length > 0) {
        await db.examMcGroups.bulkPut(examMcGroupRecords);
      }

      sessionStore.setDirty(false);
      invalidateOwner("exam", draftExamId);
      window.location.href = `/exam/${examId}`;
    } catch (err: any) {
      errorMsg = err.message || translate("examCreation.errors.createExamFailed");
    } finally {
      isLoading = false;
    }
  }

  // Self-recompute: tracks only the selection inputs; examItems is read untracked.
  $effect.pre(() => {
    const libraryIds = selectedLibraryIds;
    const groups = mcGroups;
    untrack(() => {
      const currentIds = new Set(libraryIds);
      const currentMcGroupIds = new Set(groups.map((g) => g.id));

      let updated = examItems.filter((item) =>
        item.type === "exercise" ? currentIds.has(item.id) : currentMcGroupIds.has(item.id)
      );

      const existingExIds = new Set(updated.filter((i) => i.type === "exercise").map((i) => i.id));
      for (const id of libraryIds) {
        if (!existingExIds.has(id)) {
          updated.push({ type: "exercise", id });
        }
      }

      const existingMcIds = new Set(updated.filter((i) => i.type === "mc_group").map((i) => i.id));
      for (const group of groups) {
        if (!existingMcIds.has(group.id)) {
          updated.push({ type: "mc_group", id: group.id });
        }
      }

      examItems = updated;
    });
  });

  $effect.pre(() => {
    const currentTitle = title;
    const libraryIds = selectedLibraryIds;
    if (currentTitle.trim() || libraryIds.length > 0) {
      untrack(() => sessionStore.setDirty(true));
    }
  });
</script>

<PageShell width="fluid">
  <PageHeader title={$t("examCreation.page.heading")} helpTopic="examCreation" />

  {#if errorMsg}
    <Alert severity="danger" class="mb-6">
      <div class="max-h-72 overflow-auto font-mono break-all whitespace-pre-wrap">{errorMsg}</div>
    </Alert>
  {/if}

  <form
    onsubmit={(e) => {
      e.preventDefault();
      handleCreateExam();
    }}
    class="@container"
  >
    <div class="grid min-w-0 grid-cols-1 gap-x-6 @6xl:grid-cols-2 @6xl:items-start">
      <div class="min-w-0">
        <ExamMetadataForm
          bind:title
          bind:testart
          bind:grade
          bind:klasse
          bind:nr
          bind:datum
          bind:fach
          bind:topic
          {topicSuggestions}
          bind:lehrernachname
          bind:infoText
        />

        <!-- Grading Key Section -->
        <div class="mb-6">
          <GradingKeyEditor bind:gradingKey />
        </div>

        <ExerciseSelector
          bind:activeTab
          {selectedLibraryIds}
          {mcStagingIds}
          {mcGroupMembership}
          {editingMcGroup}
          {libraryExercises}
          {filteredGroups}
          {totalVariantsCount}
          {availableGrades}
          {availableSubjects}
          {availableTopics}
          bind:searchQuery
          bind:selectedGradeFilter
          bind:selectedSubjectFilter
          bind:selectedTopicFilter
          {activeVariantPerGroup}
          bind:customName
          bind:customTopicTag
          bind:customLatexBody
          bind:saveCustomToLibrary
          onToggleSelection={toggleLibrarySelection}
          onToggleMcStaging={toggleMcStaging}
          onReorderMcStaging={reorderMcStaging}
          onFinalizeMcGroup={finalizeMcGroup}
          onSetGroupVariant={setGroupVariant}
          onQuickEdit={openQuickEdit}
          onAddCustomExercise={handleAddCustomExercise}
        />
      </div>

      <div class="min-w-0">
        <SelectedExercisesList
          {selectedExercises}
          {mcGroups}
          {examItems}
          {libraryExercises}
          {totalPoints}
          {isPreviewLoading}
          onLivePreview={handleLivePreview}
          onQuickEdit={openQuickEdit}
          onMoveExercise={moveExercise}
          onMoveExamItem={moveExamItem}
          onRemove={toggleLibrarySelection}
          onRemoveMcGroup={removeMcGroup}
          onEditMcGroup={editMcGroup}
        />

        <ExamLivePreviewPanel
          {previewPdfUrl}
          {previewSolutionPdfUrl}
          bind:showAngabePreview
          bind:showLoesungPreview
        />

        <Button
          type="submit"
          size="lg"
          block
          loading={isLoading}
          disabled={isLoading || (selectedExercises.length === 0 && mcGroups.length === 0)}
        >
          {isLoading ? $t("examCreation.status.creatingExam") : $t("examCreation.submit.saveAndContinue")}
        </Button>
      </div>
    </div>
  </form>

  <ExerciseEditorModal
    isOpen={isQuickEditorOpen}
    editingExercise={editingExerciseForQuickEdit}
    onClose={() => (isQuickEditorOpen = false)}
    onSave={handleQuickEditSaved}
  />
</PageShell>
