<script lang="ts">
  import { onMount } from "svelte";
  import { db } from "$lib/db/db";
  import { sessionStore, isAuthenticated } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { loadExercisesEncrypted, saveExerciseEncrypted, saveExamEncrypted, encryptExercise } from "$lib/db/dbEncryption";
  import { api } from "$lib/api/client";
  import { parseExerciseScore, formatExerciseLatex } from "$lib/latex/scoreParser";
  import { compileLatex } from "$lib/latex/compiler";
  import { get } from "svelte/store";
  import ExerciseEditorModal from "$lib/components/ExerciseEditorModal.svelte";
  import GradingKeyEditor from "$lib/components/GradingKeyEditor.svelte";
  import { getPresetCutoffs } from "$lib/analytics/gradingKey";
  import type { GradingKeyConfig } from "$lib/db/schema";
  import ExamMetadataForm from "$lib/components/exam-creation/ExamMetadataForm.svelte";
  import ExerciseSelector from "$lib/components/exam-creation/ExerciseSelector.svelte";
  import SelectedExercisesList from "$lib/components/exam-creation/SelectedExercisesList.svelte";
  import ExamLivePreviewPanel from "$lib/components/exam-creation/ExamLivePreviewPanel.svelte";

  // Metadata
  let title = "";
  let testart = "Kurzarbeit";
  let klasse = "10a";
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
  let selectedTopicFilter: string = "ALL";
  let selectedGradeFilter: string = "ALL";
  let selectedSubjectFilter: string = "ALL";
  let searchQuery: string = "";
  let activeTab: "library" | "custom" = "library";

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
    const matchesTopic =
      selectedTopicFilter === "ALL" || ex.topicTag === selectedTopicFilter;
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
    return matchesTopic && matchesGrade && matchesSubject && matchesSearch;
  });

  $: filteredGroups = groupExercises(filteredLibrary);
  $: totalVariantsCount = filteredGroups.reduce((acc, g) => acc + g.variants.size, 0);

  $: selectedExercises = selectedLibraryIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e));

  $: totalPoints = selectedExercises.reduce(
    (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
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

  function moveExercise(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedLibraryIds.length) return;
    const copy = [...selectedLibraryIds];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    selectedLibraryIds = copy;
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
    if (selectedExercises.length === 0) {
      alert("Please select at least one exercise to preview.");
      return;
    }

    isPreviewLoading = true;
    errorMsg = "";
    try {
      const exerciseInputs = selectedExercises
        .map((ex, idx) =>
          formatExerciseLatex(
            ex.latexBody,
            ex.name || `Aufgabe ${idx + 1}`,
          ),
        )
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
\\Klasse{${klasse}}
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

      const resAngabe = await compileLatex(fullTexAngabe, useLocal, (status) => {
        if (status === 'downloading') {
          errorMsg = "Loading local LaTeX compiler... (Downloading ~32MB on first load, please wait)";
        } else if (status === 'compiling') {
          errorMsg = "Compiling PDF...";
        }
      }, false);

      const blobAngabe = new Blob([resAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = URL.createObjectURL(blobAngabe);

      const resLoesung = await compileLatex(fullTexLoesung, useLocal, undefined, false);
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
    if (selectedLibraryIds.length === 0) {
      errorMsg = "Please select at least one exercise for the exam.";
      return;
    }

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

      // Save junction links in IDB
      const examExerciseRecords = selectedLibraryIds.map((exId, idx) => ({
        examId,
        exerciseId: exId,
        orderIndex: idx + 1,
      }));
      await db.examExercises.bulkPut(examExerciseRecords);

      if ($storagePolicyStore.storageMode !== "all-local") {
        try {
          await api.post("/exams", {
            id: examId,
            title,
            testart,
            klasse,
            datum,
            nr,
            fach,
            lehrernachname,
            info_text: infoText,
            retention_until: retentionUntil,
            exercise_ids: selectedLibraryIds,
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
    <div class="error-banner">{errorMsg}</div>
  {/if}

  <form on:submit|preventDefault={handleCreateExam}>
    <ExamMetadataForm
      bind:title
      bind:testart
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
      onSetGroupVariant={setGroupVariant}
      onQuickEdit={openQuickEdit}
      onAddCustomExercise={handleAddCustomExercise}
    />

    <SelectedExercisesList
      {selectedExercises}
      {totalPoints}
      {isPreviewLoading}
      onLivePreview={handleLivePreview}
      onQuickEdit={openQuickEdit}
      onMoveExercise={moveExercise}
      onRemove={toggleLibrarySelection}
    />

    <ExamLivePreviewPanel
      {previewPdfUrl}
      {previewSolutionPdfUrl}
      bind:showAngabePreview
      bind:showLoesungPreview
    />

    <button
      type="submit"
      class="submit-btn"
      class:is-loading={isLoading}
      disabled={isLoading || selectedExercises.length === 0}
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

<style>
  .new-exam-page {
    padding: 1.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  h2 {
    color: #38bdf8;
    margin-bottom: 1.5rem;
  }

  .submit-btn {
    width: 100%;
    padding: 0.875rem;
    background: #16a34a;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 300px;
    overflow-y: auto;
    font-family: "Fira Code", monospace;
  }

  @media (max-width: 640px), (max-height: 760px) and (orientation: landscape) {
    .new-exam-page {
      padding: 1rem;
    }

    .submit-btn {
      width: 100%;
    }
  }
</style>
