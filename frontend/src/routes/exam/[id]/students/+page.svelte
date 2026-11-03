<script lang="ts">
  /** The exam's students (issue #209): the one place for names, Mebis/Artemis IDs and e-mail addresses; QR printing and sharing only read them. */
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert, PageShell, Spinner } from "#lib/components/ui";
  import RosterManager from "#lib/components/manual-grading/RosterManager.svelte";
  import StudentImport from "#lib/components/students/StudentImport.svelte";
  import { loadExamEncrypted } from "#lib/db/dbEncryption";
  import type { StudentRecord, SubmissionRecord } from "#lib/db/schema";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { awaitSessionReady, isUnlocked, sessionStore } from "#lib/stores/session";

  let examId = $derived(page.params.id ?? "");
  let examTitle = $state("");
  let students = $state.raw<StudentRecord[]>([]);
  let submissions = $state.raw<SubmissionRecord[]>([]);
  let loading = $state(true);
  let error = $state("");

  async function load() {
    const key = get(sessionStore).sessionKey;
    try {
      const [exam, nextStudents, nextSubmissions] = await Promise.all([
        loadExamEncrypted(examId, key),
        studentRepository.getByExamId(examId, key),
        submissionRepository.getByExamId(examId, key),
      ]);
      examTitle = exam?.title ?? "";
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
    <h1 class="m-0 text-xl font-semibold">{$t("lms.students.title", { exam: examTitle })}</h1>
    <p class="m-0 text-sm text-muted">{$t("lms.students.intro")}</p>

    {#if error}
      <Alert severity="danger">{error}</Alert>
    {:else if loading}
      <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.share.loading")}</div>
    {:else}
      <StudentImport {examId} {students} onImported={load} />
      <RosterManager {examId} {students} {submissions} listMode onRosterChanged={load} />
    {/if}
  </div>
</PageShell>
