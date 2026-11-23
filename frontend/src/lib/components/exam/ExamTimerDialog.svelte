<script lang="ts">
  /** Hands the exam's working time and time extensions to the room timer Examtimer (issue #265): as a link opened in a new tab (data in the URL fragment) or as a file to import there. Opened through `open(exam)` from the Overview and the Students page. */
  import { get } from "svelte/store";
  import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal, Spinner, actionIcons } from "#lib/components/ui";
  import { downloadBlob } from "#lib/utils/download";
  import type { ExamRecord, StudentRecord } from "#lib/db/schema";
  import { buildTimerData, timerExtensionLabels, timerFile, timerLink, timerLinkProblem, timerUrl } from "#lib/export/examTimer";
  import { examFileName, FILE_KIND } from "#lib/export/fileName";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { sessionStore } from "#lib/stores/session";
  import { examTimerSettingsHref } from "#lib/utils/links";

  let exam = $state.raw<ExamRecord | null>(null);
  let students = $state.raw<StudentRecord[] | null>(null);
  let error = $state("");
  let names = $state(false);

  let data = $derived(exam && students ? buildTimerData(exam, students, { names }) : null);
  let extensions = $derived(data ? timerExtensionLabels(data) : []);
  // A first name can only label an extension that exactly one student holds.
  let nameable = $derived(!!exam && !!students && buildTimerData(exam, students, { names: true }).settings.extensions.some((ext) => ext.label));
  let ready = $derived(!!data && !!exam?.durationMinutes);
  let linkProblem = $derived(data ? timerLinkProblem(data) : null);
  let base = $derived(exam ? timerUrl() : "");

  /** Opens the dialog for *target* and reads its students; a failed read is shown, never treated as "no extensions". */
  export async function open(target: ExamRecord) {
    exam = target;
    students = null;
    error = "";
    names = false;
    try {
      students = await studentRepository.getByExamId(target.id, get(sessionStore).sessionKey);
    } catch (err) {
      error = `${$t("lms.students.loadFailed")} ${err instanceof Error ? err.message : ""}`.trim();
    }
  }

  function download() {
    if (data && exam) downloadBlob(timerFile(data), examFileName(exam, [FILE_KIND.examtimer], "json"));
  }
</script>

{#if exam}
  <Modal open={true} size="medium" title={$t("export.timer.title")} closeOnBackdrop onClose={() => (exam = null)} {error}>
    <div class="flex min-w-0 flex-col gap-4">
      <p class="m-0 text-sm text-muted">{$t("export.timer.intro")}</p>
      {#if !students && !error}
        <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.share.loading")}</div>
      {:else if data}
        <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted">{$t("export.timer.exam")}</dt>
          <dd class="m-0">{[data.settings.exam, data.settings.subject, data.settings.course].filter(Boolean).join(" · ") || "-"}</dd>
          <dt class="text-muted">{$t("export.timer.duration")}</dt>
          <dd class="m-0 tabular-nums">{exam.durationMinutes ? $t("export.timer.minutes", { count: exam.durationMinutes }) : "-"}</dd>
          <dt class="text-muted">{$t("export.timer.reading")}</dt>
          <dd class="m-0 tabular-nums">{exam.readingMinutes ? $t("export.timer.minutes", { count: exam.readingMinutes }) : $t("export.timer.noReading")}</dd>
          <dt class="text-muted">{$t("export.timer.extensions")}</dt>
          <dd class="m-0 tabular-nums">{extensions.length ? extensions.join(", ") : $t("export.timer.noExtensions")}</dd>
        </dl>
        {#if linkProblem === "noDuration"}
          <Alert severity="warning">{$t("export.timer.noDuration")}</Alert>
        {:else if linkProblem === "tooMany"}
          <Alert severity="warning">{$t("export.timer.tooMany")}</Alert>
        {/if}
        {#if nameable}
          <div class="flex flex-col gap-1">
            <Checkbox bind:checked={names} label={$t("export.timer.names")} />
            <p class="m-0 text-xs text-muted">{$t("export.timer.namesHint")}</p>
          </div>
        {/if}
        <p class="m-0 text-xs text-muted">
          {$t("export.timer.address", { url: base })}
          <a class="text-accent underline" href={examTimerSettingsHref}>{$t("export.timer.changeAddress")}</a>
        </p>
      {/if}
    </div>

    {#snippet footer()}
      <Button variant="outlined" severity="secondary" icon={actionIcons.download} disabled={!ready} onClick={download}>{$t("export.timer.download")}</Button>
      {#if data && !linkProblem}
        <Button icon={faUpRightFromSquare} href={timerLink(base, data)} target="_blank" rel="noopener noreferrer">{$t("export.timer.open")}</Button>
      {:else}
        <Button icon={faUpRightFromSquare} disabled>{$t("export.timer.open")}</Button>
      {/if}
    {/snippet}
  </Modal>
{/if}
