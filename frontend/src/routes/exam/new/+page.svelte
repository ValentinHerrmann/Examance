<script lang="ts">
  import "./+page.css";
  import { onMount } from "svelte";
  import { db } from "$lib/db/db";
  import { sessionStore, isAuthenticated } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { loadExercisesEncrypted, saveExerciseEncrypted, saveExamEncrypted, encryptExercise } from "$lib/db/dbEncryption";
  import { api } from "$lib/api/client";
  import { parseExerciseScore, formatExerciseLatex, formatMcGroupLatex } from "$lib/latex/scoreParser";
  import { recordValue } from "$lib/utils/recentValues";
  import { compileLatex } from "$lib/latex/compiler";
  import { exerciseResourceRepository } from "$lib/repositories/exerciseResourceRepository";
  import { get } from "svelte/store";
  import ExerciseEditorModal from "$lib/components/ExerciseEditorModal.svelte";
  import GradingKeyEditor from "$lib/components/GradingKeyEditor.svelte";
  import { getPresetCutoffs } from "$lib/analytics/gradingKey";
  import type { GradingKeyConfig } from "$lib/db/schema";
  import ExamMetadataForm from "$lib/components/exam-creation/ExamMetadataForm.svelte";
  import ExerciseSelector from "$lib/components/exam-creation/ExerciseSelector.svelte";
  import SelectedExercisesList from "$lib/components/exam-creation/SelectedExercisesList.svelte";
  import ExamLivePreviewPanel from "$lib/components/exam-creation/ExamLivePreviewPanel.svelte";
  import { formatExamCourse } from "$lib/utils/examLabel";

  // Metadata
  let title = "";
  let testart = "Kurzarbeit";
  let grade = "10";
  let klasse = "a";
  let datum = new Date().toLocaleDateString("de-DE") + " (30 Minuten)";
  let nr = "1";
  let fach = "Informatik";
  let lehrernachname = "";
  let infoText = `\\begin{itemize}
    \\item Die Arbeit wird anonymisiert korrigiert. Trage deine Initialen ins QR-Code-Feld ein.
    \\item Mit Bleistift oder rot/rosa Geschriebenes kann \\textbf{nicht} gewertet werden!
\\end{itemize}`;
  let retentionDays = 365;

  let gradingKey: GradingKeyConfig = {
    preset: "linear_50",
    cutoffs: getPresetCutoffs("linear_50"),
  };

  // Library & Selection state
  let libraryExercises: ExerciseRecord[] = [];
  let selectedLibraryIds: string[] = [];

  // MC group staging & finalized groups
  interface McGroup {
    id: string;
    title: string;
    scoringText: string;
    memberIds: string[];
  }

  interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }

  let mcStagingIds: string[] = [];
  let mcGroups: McGroup[] = [];
  let examItems: ExamItemRef[] = [];
  let selectedTopicFilter: string = "ALL";
  let selectedGradeFilter: string = "ALL";
  let selectedSubjectFilter: string = "ALL";
  let searchQuery: string = "";
  let activeTab: "library" | "custom" = "library";

  $: {
    const currentIds = new Set(selectedLibraryIds);
    const currentMcGroupIds = new Set(mcGroups.map((g) => g.id));

    let updated = examItems.filter((item) =>
      item.type === "exercise" ? currentIds.has(item.id) : currentMcGroupIds.has(item.id)
    );

    const existingExIds = new Set(updated.filter((i) => i.type === "exercise").map((i) => i.id));
    for (const id of selectedLibraryIds) {
      if (!existingExIds.has(id)) {
        updated.push({ type: "exercise", id });
      }
    }

    const existingMcIds = new Set(updated.filter((i) => i.type === "mc_group").map((i) => i.id));
    for (const group of mcGroups) {
      if (!existingMcIds.has(group.id)) {
        updated.push({ type: "mc_group", id: group.id });
      }
    }

    examItems = updated;
  }

  // Quick exercise editor state
  let isQuickEditorOpen = false;
  let editingExerciseForQuickEdit: ExerciseRecord | null = null;

  function openQuickEdit(ex: ExerciseRecord) {
    editingExerciseForQuickEdit = ex;
    isQuickEditorOpen = true;
  }

  async function handleQuickEditSaved() {
    await loadLibrary();
  }

  $: {
    if (title.trim() || selectedLibraryIds.length > 0) {
      sessionStore.setDirty(true);
    }
  }

  // Exercise grouping & preview modal state
  interface VariantMember {
    ex: ExerciseRecord;
    variantLabel: string;
    version: number;
    isCurrent: boolean;
  }

  interface ExerciseGroup {
    groupId: string;
    name: string;
    topicTag: string;
    grade?: string;
    subject?: string;
    maxPoints: number;
    minPoints: number;
    variants: Map<string, VariantMember[]>;
    allMembers: VariantMember[];
  }

  let activeVariantPerGroup: Record<string, string> = {};

  // Inline custom exercise form
  let customName = "Custom_Exercise";
  let customTopicTag = "_General";
  let customLatexBody = `\\begin{Aufgabe}{Eigene Aufgabe}
Frage hier eingeben... \\BE
\\end{Aufgabe}`;
  let saveCustomToLibrary = true;

  // State
  let isLoading = false;
  let errorMsg = "";
  let previewPdfUrl: string | null = null;
  let previewSolutionPdfUrl: string | null = null;
  let showAngabePreview = true;
  let showLoesungPreview = false;
  let isPreviewLoading = false;

  $: availableTopics = Array.from(
    new Set(
      libraryExercises
        .map((e) => e.topicTag)
        .filter((t): t is string => Boolean(t)),
    ),
  ).sort();

  $: availableGrades = Array.from(
    new Set(
      libraryExercises
        .map((e) => e.grade)
        .filter((g): g is string => Boolean(g)),
    ),
  ).sort();

  $: availableSubjects = Array.from(
    new Set(
      libraryExercises
        .map((e) => e.subject)
        .filter((s): s is string => Boolean(s)),
    ),
  ).sort();

  $: filteredLibrary = libraryExercises.filter((ex) => {
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
  });

  $: filteredGroups = groupExercises(filteredLibrary);
  $: totalVariantsCount = filteredGroups.reduce((acc, g) => acc + g.variants.size, 0);

  $: selectedExercises = selectedLibraryIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e));

  $: mcGroupExercises = mcGroups.map((g) => ({
    group: g,
    members: g.memberIds
      .map((id) => libraryExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e)),
  }));

  $: totalPoints =
    selectedExercises.reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    ) +
    mcGroupExercises.reduce(
      (sum, { members }) =>
        sum + members.reduce((s, ex) => s + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0), 0),
      0,
    );

  onMount(() => {
    loadLibrary();
  });

  function groupExercises(exs: ExerciseRecord[]): ExerciseGroup[] {
    const buckets = new Map<string, ExerciseRecord[]>();

    for (const ex of exs) {
      const key = ex.exerciseGroupId || `name:${ex.name || "Untitled"}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(ex);
    }

    const groups: ExerciseGroup[] = [];

    for (const [groupId, members] of buckets) {
      const currentMembers = members.filter((m) => m.isCurrent !== false);
      if (currentMembers.length === 0) continue;

      const name = currentMembers[0]?.name || "Untitled";
      const topicTag = currentMembers[0]?.topicTag || "_General";
      const grade = currentMembers[0]?.grade;
      const subject = currentMembers[0]?.subject;

      const variants = new Map<string, VariantMember[]>();
      for (const ex of currentMembers) {
        const vKey = ex.variantKey || "_General";
        if (!variants.has(vKey)) variants.set(vKey, []);
        variants.get(vKey)!.push({
          ex,
          variantLabel: vKey,
          version: ex.version || 1,
          isCurrent: ex.isCurrent !== false,
        });
      }

      const sortedVariants = new Map<string, VariantMember[]>();
      const keys = [...variants.keys()].sort((a, b) => {
        if (a === "_General") return -1;
        if (b === "_General") return 1;
        return a.localeCompare(b);
      });
      for (const k of keys) sortedVariants.set(k, variants.get(k)!);

      for (const [, vMembers] of sortedVariants) {
        vMembers.sort((a, b) => b.version - a.version);
      }

      const allMembers: VariantMember[] = [];
      for (const [, vMembers] of sortedVariants) {
        allMembers.push(...vMembers);
      }

      const scores = allMembers.map((m) => parseExerciseScore(m.ex.latexBody || "") || m.ex.maxPoints || 0);
      const maxPoints = scores.length > 0 ? Math.max(...scores) : 0;
      const minPoints = scores.length > 0 ? Math.min(...scores) : 0;

      groups.push({
        groupId,
        name,
        topicTag,
        grade,
        subject,
        maxPoints,
        minPoints,
        variants: sortedVariants,
        allMembers,
      });
    }

    groups.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }

  async function loadLibrary() {
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        try {
          const remoteExs = (await api.get("/exercises")) as any[];
          libraryExercises = remoteExs.map((e: any) => ({
            id: e.id,
            teacherId: e.teacher_id,
            name: e.name,
            topicTag: e.topic_tag,
            grade: e.grade || undefined,
            subject: e.subject || undefined,
            latexBody: e.latex_body,
            maxPoints: e.max_points,
            version: e.version || 1,
            questionType: e.question_type || "free_text",
            penalty: e.penalty || 0,
            exerciseGroupId: e.exercise_group_id || undefined,
            variantKey: e.variant_key || undefined,
            isCurrent: e.is_current,
          }));
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
    if (mcStagingIds.includes(id)) {
      mcStagingIds = mcStagingIds.filter((i) => i !== id);
    } else {
      if (mcStagingIds.length >= 4) return;
      mcStagingIds = [...mcStagingIds, id];
    }
  }

  function reorderMcStaging(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= mcStagingIds.length) return;
    const copy = [...mcStagingIds];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    mcStagingIds = copy;
  }

  function finalizeMcGroup(groupTitle: string, scoringText: string) {
    if (mcStagingIds.length < 1 || mcStagingIds.length > 4) return;
    mcGroups = [
      ...mcGroups,
      {
        id: crypto.randomUUID(),
        title: groupTitle,
        scoringText,
        memberIds: [...mcStagingIds],
      },
    ];
    mcStagingIds = [];
  }

  function removeMcGroup(id: string) {
    mcGroups = mcGroups.filter((g) => g.id !== id);
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
      alert("Exercise name is required.");
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
      await saveExerciseEncrypted(newEx, key);
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        try {
          await api.post("/exercises", {
            id: newEx.id,
            name: newEx.name,
            topic_tag: newEx.topicTag,
            latex_body: newEx.latexBody,
          });
        } catch (apiErr) {
          console.warn("Failed to sync new exercise to server:", apiErr);
        }
      }
      libraryExercises = [...libraryExercises, newEx];
    } else {
      libraryExercises = [...libraryExercises, newEx];
    }

    selectedLibraryIds = [...selectedLibraryIds, newEx.id];
    activeTab = "library";
  }

  async function handleLivePreview() {
    if (selectedExercises.length === 0 && mcGroupExercises.length === 0) {
      alert("Please select at least one exercise to preview.");
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

      const useLocal = $storagePolicyStore.latexCompilation === "local";
      if (useLocal) {
        errorMsg = "Compiling PDF...";
      }

      // Resource files of every exercise in the draft exam (see
      // lib/latex/resources.ts for the flat-filename rules).
      const compileOpts = {
        resources: await exerciseResourceRepository.collectForCompile(
          [
            ...selectedExercises.map((ex) => ({ id: ex.id, label: ex.name })),
            ...mcGroupExercises.flatMap(({ group, members }) =>
              members.map((ex) => ({ id: ex.id, label: ex.name || group.title }))
            ),
          ],
          get(sessionStore).sessionKey
        ),
      };

      const resAngabe = await compileLatex(fullTexAngabe, useLocal, (status) => {
        if (status === 'downloading') {
          errorMsg = "Loading local LaTeX compiler... (Downloading ~32MB on first load, please wait)";
        } else if (status === 'compiling') {
          errorMsg = "Compiling PDF...";
        }
      }, false, compileOpts);

      const blobAngabe = new Blob([resAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = URL.createObjectURL(blobAngabe);

      const resLoesung = await compileLatex(fullTexLoesung, useLocal, undefined, false, compileOpts);
      const blobLoesung = new Blob([resLoesung.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = URL.createObjectURL(blobLoesung);

      errorMsg = ""; // clear loading message
    } catch (err: any) {
      errorMsg = err.message || "Preview compilation failed.";
    } finally {
      isPreviewLoading = false;
    }
  }

  async function handleCreateExam() {
    if (!title.trim()) {
      errorMsg = "Exam title is required.";
      return;
    }
    if (selectedLibraryIds.length === 0 && mcGroups.length === 0) {
      errorMsg = "Please select at least one exercise for the exam.";
      return;
    }

    // Record metadata inputs to recent values
    if (testart) recordValue("exam.testart", testart);
    if (grade) recordValue("exam.grade", grade);
    if (klasse) recordValue("exam.klasse", klasse);
    if (fach) recordValue("exam.fach", fach);
    if (lehrernachname) recordValue("exam.lehrernachname", lehrernachname);

    isLoading = true;
    errorMsg = "";
    const examId = crypto.randomUUID();
    const retentionUntil = new Date(Date.now() + retentionDays * 86400000)
      .toISOString()
      .split("T")[0];

    try {
      const key = get(sessionStore).sessionKey;
      await saveExamEncrypted({
        id: examId,
        teacherId: $sessionStore.email || "local-teacher",
        title,
        testart,
        grade,
        klasse,
        datum,
        nr,
        fach,
        lehrernachname,
        infoText,
        gradingKey,
        retentionUntil,
        compilationStatus: "pending",
        createdAt: new Date().toISOString(),
      }, key);

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

      await db.examExercises.bulkPut(examExerciseRecords);
      if (examMcGroupRecords.length > 0) {
        await db.examMcGroups.bulkPut(examMcGroupRecords);
      }

      if ($storagePolicyStore.storageMode !== "all-local") {
        try {
          await api.post("/exams", {
            id: examId,
            title,
            testart,
            grade,
            klasse,
            datum,
            nr,
            fach,
            lehrernachname,
            info_text: infoText,
            grading_key: gradingKey,
            retention_until: retentionUntil,
            mc_groups: mcGroupsPayload,
            exercise_links: exerciseLinksPayload,
          });
        } catch (apiErr) {
          console.warn("Failed to sync exam to server:", apiErr);
        }
      }

      sessionStore.setDirty(false);
      window.location.href = `/exam/${examId}`;
    } catch (err: any) {
      errorMsg = err.message || "Failed to create exam.";
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="new-exam-page">
  <h2>Create Exam (Assembly from Exercise Library)</h2>

  {#if errorMsg}
    <div class="exam-new-error-banner">{errorMsg}</div>
  {/if}

  <form on:submit|preventDefault={handleCreateExam}>
    <ExamMetadataForm
      bind:title
      bind:testart
      bind:grade
      bind:klasse
      bind:nr
      bind:datum
      bind:fach
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

    <SelectedExercisesList
      {selectedExercises}
      {mcGroups}
      {libraryExercises}
      {totalPoints}
      {isPreviewLoading}
      onLivePreview={handleLivePreview}
      onQuickEdit={openQuickEdit}
      onMoveExercise={moveExercise}
      onRemove={toggleLibrarySelection}
      onRemoveMcGroup={removeMcGroup}
    />

    <ExamLivePreviewPanel
      {previewPdfUrl}
      {previewSolutionPdfUrl}
      bind:showAngabePreview
      bind:showLoesungPreview
    />

    <button
      type="submit"
      class="exam-new-submit-btn"
      class:is-loading={isLoading}
      disabled={isLoading || (selectedExercises.length === 0 && mcGroups.length === 0)}
    >
      {isLoading ? "Creating Exam..." : "Save Exam & Continue"}
    </button>
  </form>

  <ExerciseEditorModal
    isOpen={isQuickEditorOpen}
    editingExercise={editingExerciseForQuickEdit}
    on:close={() => (isQuickEditorOpen = false)}
    on:save={handleQuickEditSaved}
  />
</div>
