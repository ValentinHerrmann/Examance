<script lang="ts">
  // "New exam" (M1): the exam's details dialog in create mode. The exam is created empty and opens on the Exam page with the library, so exercises, MC groups, order, layout and preview live in one place.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { awaitSessionReady, isUnlocked, sessionStore } from "#lib/stores/session";
  import { examRepository } from "#lib/repositories/examRepository";
  import { getPresetCutoffs } from "#lib/analytics/gradingKey";
  import type { ExamRecord, GradingKeyConfig } from "#lib/db/schema";
  import { t, translate } from "#lib/i18n";
  import { PageShell } from "#lib/components/ui";
  import ExamMetadataEditor from "#lib/components/exam/ExamMetadataEditor.svelte";
  import { NEW_EXAM_PRINT } from "#lib/exam/printLayout";

  const RETENTION_DAYS = 365;
  // Exam content printed in the German PDF, not UI copy: deliberately not translated.
  const INFO_TEXT = `\\begin{itemize}
    \\item Die Arbeit wird anonymisiert korrigiert. Trage deine Initialen ins QR-Code-Feld ein.
    \\item Mit Bleistift oder rot/rosa Geschriebenes kann \\textbf{nicht} gewertet werden!
\\end{itemize}`;

  let title = $state("");
  let testart = $state("Kurzarbeit");
  let grade = $state("10");
  let klasse = $state("a");
  let course = $state("");
  let datum = $state(`${new Date().toLocaleDateString("de-DE")} (30 Minuten)`);
  let nr = $state("1");
  let fach = $state("Informatik");
  let topic = $state("");
  let lehrernachname = $state("");
  const infoText = INFO_TEXT;
  const nameLine = false;
  const mcCorrectionHint = false;
  let retentionUntil = $state(new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString().slice(0, 10));
  // Layout and grading key start with these defaults; they are edited on the Exam and Statistics pages (issue #212).
  const gradingKey: GradingKeyConfig = { preset: "linear_50", cutoffs: getPresetCutoffs("linear_50") };
  let ready = $state(false);
  let busy = $state(false);
  let error = $state("");

  onMount(async () => {
    await awaitSessionReady();
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
    ready = true;
  });

  async function handleCreate() {
    if (!title.trim()) return;
    busy = true;
    error = "";
    const exam: ExamRecord = {
      id: crypto.randomUUID(),
      teacherId: get(sessionStore).email || "local-teacher",
      title: title.trim(),
      testart,
      grade,
      klasse,
      course: course.trim() || undefined,
      datum,
      nr,
      fach,
      topic: topic.trim() || undefined,
      lehrernachname,
      infoText,
      nameLine,
      mcCorrectionHint,
      ...NEW_EXAM_PRINT,
      gradingKey,
      retentionUntil,
      compilationStatus: "pending",
      createdAt: new Date().toISOString(),
    };
    try {
      await examRepository.create(exam, { exercise_links: [], mc_groups: [] });
      await goto(`/exam/${exam.id}/content?library=open`);
    } catch (err) {
      error = translate("exam.metadataEditor.createFailed") + (err instanceof Error ? ` ${err.message}` : "");
    } finally {
      busy = false;
    }
  }
</script>

<PageShell width="narrow" center>
  <!-- The page is only the dialog; its h1 names the page for assistive technology. -->
  <h1 class="sr-only">{$t("exam.metadataEditor.createHeading")}</h1>
  <ExamMetadataEditor
    isOpen={ready}
    create
    {busy}
    {error}
    bind:editTitle={title}
    bind:editTestart={testart}
    bind:editGrade={grade}
    bind:editKlasse={klasse}
    bind:editCourse={course}
    bind:editDatum={datum}
    bind:editNr={nr}
    bind:editFach={fach}
    bind:editTopic={topic}
    bind:editLehrernachname={lehrernachname}
    bind:editRetentionUntil={retentionUntil}
    onSave={handleCreate}
    onCancel={() => goto("/")}
  />
</PageShell>
