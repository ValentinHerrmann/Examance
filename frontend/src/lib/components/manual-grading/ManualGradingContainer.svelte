<script lang="ts">
  import { faClipboard, faPen, faUser, faUsers } from "@fortawesome/free-solid-svg-icons";
  import { Button, Card, PageHeader, Tabs } from "#lib/components/ui";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import {
    loadExamEncrypted,
    loadExamExercisesEncrypted,
  } from "#lib/db/dbEncryption";
  import { scoreRepository } from "#lib/repositories/scoreRepository";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import type {
    ExamRecord,
    ExerciseRecord,
    StudentRecord,
    SubmissionRecord,
  } from "#lib/db/schema";
  import RosterManager from "./RosterManager.svelte";
  import ExerciseFirstGrid from "./ExerciseFirstGrid.svelte";
  import StudentFirstGrid from "./StudentFirstGrid.svelte";
  import PasteImportModal from "./PasteImportModal.svelte";
  import { t } from "#lib/i18n";

  interface Props {
    examId: string;
  }

  let { examId }: Props = $props();

  let activeTab: "roster" | "exercise-first" | "student-first" = $state("exercise-first");
  let showImportModal = $state(false);
  let loading = $state(true);

  // Raw: these records go to repositories, and children mutate them in place before `onScoresChanged`.
  let exam: ExamRecord | null = $state.raw(null);
  let exercises: ExerciseRecord[] = $state.raw([]);
  let students: StudentRecord[] = $state.raw([]);
  let submissions: SubmissionRecord[] = $state.raw([]);
  let scoresMap: Map<string, Record<string, number | null>> = $state.raw(new Map());

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

      // One request for the whole exam instead of one per submission, to
      // avoid an N+1 over the network in server mode.
      const allScores = await scoreRepository.getByExamId(examId, key);
      const scoresBySubmission = new Map<string, typeof allScores>();
      for (const s of allScores) {
        const bucket = scoresBySubmission.get(s.submissionId);
        if (bucket) bucket.push(s);
        else scoresBySubmission.set(s.submissionId, [s]);
      }

      const newScoresMap = new Map<string, Record<string, number | null>>();
      for (const sub of submissions) {
        const mapForSub: Record<string, number | null> = {};
        for (const ex of exercises) {
          mapForSub[ex.id] = null;
        }
        for (const s of scoresBySubmission.get(sub.id) ?? []) {
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

  function onTabChange(id: string) {
    activeTab = id as typeof activeTab;
  }

  async function handleDataChanged() {
    await refreshAllData();
  }
</script>

<div class="flex min-w-0 flex-col gap-4">
  <PageHeader
    title={$t("grading.manual.container.title")}
    subtitle={$t("grading.manual.container.subtitle")}
  >
    {#snippet actions()}
      <Button icon={faClipboard} onClick={() => (showImportModal = true)}>
        {$t("grading.manual.container.importButton")}
      </Button>
    {/snippet}
  </PageHeader>

  <Tabs
    items={[
      { id: "exercise-first", label: $t("grading.manual.container.tabExerciseFirst"), icon: faPen },
      { id: "student-first", label: $t("grading.manual.container.tabStudentFirst"), icon: faUser },
      { id: "roster", label: $t("grading.manual.container.tabRoster", { count: students.length }), icon: faUsers },
    ]}
    value={activeTab}
    onChange={onTabChange}
  />

  <Card class="min-h-96">
    {#if loading}
      <div class="flex min-h-60 items-center justify-center text-muted">{$t("grading.manual.container.loading")}</div>
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
  </Card>
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
