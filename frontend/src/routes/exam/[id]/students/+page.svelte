<script lang="ts">
  /** The exam's students (issue #209): the one place for names, Mebis/Artemis IDs and e-mail addresses; QR printing and sharing only read them. */
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert, Button, PageHeader, PageShell, Spinner, actionIcons } from "#lib/components/ui";
  import StudentEditDialog from "#lib/components/students/StudentEditDialog.svelte";
  import ExamStepFooter from "#lib/components/exam/ExamStepFooter.svelte";
  import RosterManager from "#lib/components/manual-grading/RosterManager.svelte";
  import StudentImport from "#lib/components/students/StudentImport.svelte";
  import type { StudentRecord, SubmissionRecord } from "#lib/db/schema";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { awaitSessionReady, isUnlocked, sessionStore } from "#lib/stores/session";

  let examId = $derived(page.params.id ?? "");
  let students = $state.raw<StudentRecord[]>([]);
  let submissions = $state.raw<SubmissionRecord[]>([]);
  let loading = $state(true);
  let error = $state("");
  let adding = $state(false);

  async function load() {
    const key = get(sessionStore).sessionKey;
    try {
      const [nextStudents, nextSubmissions] = await Promise.all([
        studentRepository.getByExamId(examId, key),
        submissionRepository.getByExamId(examId, key),
      ]);
      students = [...nextStudents].sort((a, b) => (a.studentName ?? "").localeCompare(b.studentName ?? "", "de"));
      submissions = nextSubmissions;
      error = "";
    } catch (err) {
      error = `${$t("lms.students.loadFailed")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await awaitSessionReady();
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
    await load();
  });
</script>

<PageShell width="wide">
  <div class="flex min-w-0 flex-col gap-6">
    <PageHeader title={$t("exam.sidebar.students")} subtitle={$t("lms.students.intro")}>
      {#snippet actions()}
        <Button icon={actionIcons.add} disabled={loading || !!error} onClick={() => (adding = true)}>{$t("lms.students.add.action")}</Button>
      {/snippet}
    </PageHeader>

    {#if error}
      <Alert severity="danger">{error}</Alert>
    {:else if loading}
      <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.share.loading")}</div>
    {:else}
      <StudentImport {examId} {students} onImported={load} />
      <RosterManager {examId} {students} {submissions} listMode onRosterChanged={load} />
    {/if}
  </div>
  <ExamStepFooter {examId} step="students" />
</PageShell>

{#if adding}
  <StudentEditDialog
    students={[]}
    all={students}
    hasSubmission={(st) => submissions.some((sub) => sub.pseudonymHmac === st.pseudonymHmac)}
    createIn={examId}
    onSaved={() => {
      adding = false;
      void load();
    }}
    onClose={() => (adding = false)}
  />
{/if}
