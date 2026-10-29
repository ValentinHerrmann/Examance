<script lang="ts">
  // "New exam" (M1): the exam's data dialog in create mode. The exam is created empty and opens in the exam editor with the library, so exercises, MC groups, order, preview and logo live in one place.
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
  let datum = $state(`${new Date().toLocaleDateString("de-DE")} (30 Minuten)`);
  let nr = $state("1");
  let fach = $state("Informatik");
  let topic = $state("");
  let lehrernachname = $state("");
  let infoText = $state(INFO_TEXT);
  let nameLine = $state(false);
  let retentionUntil = $state(new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString().slice(0, 10));
  let gradingKey: GradingKeyConfig = $state({ preset: "linear_50", cutoffs: getPresetCutoffs("linear_50") });
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
      datum,
      nr,
      fach,
      topic: topic.trim() || undefined,
      lehrernachname,
      infoText,
      nameLine,
      gradingKey: $state.snapshot(gradingKey),
      retentionUntil,
      compilationStatus: "pending",
      createdAt: new Date().toISOString(),
    };
    try {
      await examRepository.create(exam, { exercise_links: [], mc_groups: [] });
      await goto(`/exam/${exam.id}?library=open`);
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
    bind:editDatum={datum}
    bind:editNr={nr}
    bind:editFach={fach}
    bind:editTopic={topic}
    bind:editLehrernachname={lehrernachname}
    bind:editInfoText={infoText}
    bind:editNameLine={nameLine}
    bind:editRetentionUntil={retentionUntil}
    bind:editGradingKey={gradingKey}
    onSave={handleCreate}
    onCancel={() => goto("/")}
  />
</PageShell>
