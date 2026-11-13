<script lang="ts">
  /** The exam's students (issue #209): the one place for names, Mebis/Artemis IDs and e-mail addresses; QR printing and sharing only read them. */
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert, Button, PageShell, Spinner, actionIcons } from "#lib/components/ui";
  import StudentEditDialog from "#lib/components/students/StudentEditDialog.svelte";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import RosterManager from "#lib/components/manual-grading/RosterManager.svelte";
  import StudentImport from "#lib/components/students/StudentImport.svelte";
  import { numberStudents } from "#lib/students/classList";
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
      students = numberStudents(nextStudents).map((n) => n.student);
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

<PageShell width="fluid">
  <div class="flex min-w-0 flex-col gap-6">
    <ExamPageHeader {examId} step="students" title={$t("exam.sidebar.students")} hint={$t("lms.students.intro")}>
      {#snippet actions()}
        <Button icon={actionIcons.add} disabled={loading || !!error} onClick={() => (adding = true)}>{$t("lms.students.add.action")}</Button>
      {/snippet}
    </ExamPageHeader>

    {#if error}
      <Alert severity="danger">{error}</Alert>
    {:else if loading}
      <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.share.loading")}</div>
    {:else}
      <!-- From xl the import sits beside the list instead of pushing it down. -->
      <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <div class="min-w-0 xl:order-2"><StudentImport {examId} {students} onImported={load} /></div>
        <div class="min-w-0 xl:order-1"><RosterManager {examId} {students} {submissions} listMode onRosterChanged={load} /></div>
      </div>
    {/if}
  </div>
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
