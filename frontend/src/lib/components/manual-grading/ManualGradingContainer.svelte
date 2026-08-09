<script lang="ts">
  import "./ManualGradingContainer.css";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import {
    loadExamEncrypted,
    loadExamExercisesEncrypted,
    loadScoresEncrypted,
  } from "$lib/db/dbEncryption";
  import { studentRepository } from "$lib/repositories/studentRepository";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import type {
    ExamRecord,
    ExerciseRecord,
    StudentRecord,
    SubmissionRecord,
  } from "$lib/db/schema";
  import RosterManager from "./RosterManager.svelte";
  import ExerciseFirstGrid from "./ExerciseFirstGrid.svelte";
  import StudentFirstGrid from "./StudentFirstGrid.svelte";
  import PasteImportModal from "./PasteImportModal.svelte";

  export let examId: string;

  let activeTab: "roster" | "exercise-first" | "student-first" = "exercise-first";
  let showImportModal = false;
  let loading = true;

  let exam: ExamRecord | null = null;
  let exercises: ExerciseRecord[] = [];
  let students: StudentRecord[] = [];
  let submissions: SubmissionRecord[] = [];
  let scoresMap: Map<string, Record<string, number | null>> = new Map();

  onMount(async () => {
    await refreshAllData();
  });

  async function refreshAllData() {
    loading = true;
    const key = get(sessionStore).sessionKey;
    try {
      exam = (await loadExamEncrypted(examId, key)) || null;
      const exList = await loadExamExercisesEncrypted(examId, key);
      exercises = exList.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      students = await studentRepository.getByExamId(examId, key);
      submissions = await submissionRepository.getByExamId(examId, key);

      const newScoresMap = new Map<string, Record<string, number | null>>();
      for (const sub of submissions) {
        const scores = await loadScoresEncrypted(sub.id, key);
        const mapForSub: Record<string, number | null> = {};
        for (const ex of exercises) {
          mapForSub[ex.id] = null;
        }
        for (const s of scores) {
          if (s.exerciseId && typeof s.score === "number" && !isNaN(s.score)) {
            mapForSub[s.exerciseId] = s.score;
          }
        }
        newScoresMap.set(sub.id, mapForSub);
      }
      scoresMap = newScoresMap;
    } catch (err) {
      console.error("Failed to load manual grading data:", err);
    } finally {
      loading = false;
    }
  }

  async function handleDataChanged() {
    await refreshAllData();
  }
</script>

<div class="manual-grading-container">
  <div class="manual-grading-header">
    <div>
      <h1>Paper & Excel Grade Entry</h1>
      <p>Enter exam points directly without scanning paper booklets, or paste score matrices from Excel.</p>
    </div>
    <div class="manual-grading-header-actions">
      <button
        class="manual-grading-import-btn"
        on:click={() => (showImportModal = true)}
      >
        📋 Import from Excel (Ctrl+V)
      </button>
    </div>
  </div>

  <div class="manual-grading-tab-bar">
    <button
      class="manual-grading-tab-btn"
      class:active={activeTab === "exercise-first"}
      on:click={() => (activeTab = "exercise-first")}
    >
      📝 Exercise-First Entry (All Students per Exercise)
    </button>
    <button
      class="manual-grading-tab-btn"
      class:active={activeTab === "student-first"}
      on:click={() => (activeTab = "student-first")}
    >
      👤 Student-First Entry (All Exercises per Student)
    </button>
    <button
      class="manual-grading-tab-btn"
      class:active={activeTab === "roster"}
      on:click={() => (activeTab = "roster")}
    >
      👥 Student Roster ({students.length})
    </button>
  </div>

  <div class="manual-grading-body">
    {#if loading}
      <div class="manual-grading-loading">Loading exam data...</div>
    {:else if activeTab === "roster"}
      <RosterManager
        {examId}
        {students}
        {submissions}
        onRosterChanged={handleDataChanged}
      />
    {:else if activeTab === "exercise-first"}
      <ExerciseFirstGrid
        {examId}
        {exercises}
        {students}
        {submissions}
        {scoresMap}
        onScoresChanged={handleDataChanged}
        onOpenRoster={() => (activeTab = "roster")}
      />
    {:else if activeTab === "student-first"}
      <StudentFirstGrid
        {exam}
        {examId}
        {exercises}
        {students}
        {submissions}
        {scoresMap}
        onScoresChanged={handleDataChanged}
        onOpenRoster={() => (activeTab = "roster")}
      />
    {/if}
  </div>
</div>

{#if showImportModal}
  <PasteImportModal
    {examId}
    {exercises}
    {students}
    {submissions}
    onClose={() => (showImportModal = false)}
    onImportComplete={async () => {
      showImportModal = false;
      await handleDataChanged();
    }}
  />
{/if}
