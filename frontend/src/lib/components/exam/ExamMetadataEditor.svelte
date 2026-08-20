<script lang="ts">
  import type { GradingKeyConfig } from '$lib/db/schema';
  import GradingKeyEditor from '$lib/components/GradingKeyEditor.svelte';
  import LatexEditor from '$lib/components/LatexEditor.svelte';
  import SuggestInput from '$lib/components/common/SuggestInput.svelte';
  import { recordValue } from '$lib/utils/recentValues';
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from '$lib/utils/examLabel';
  import { t } from '$lib/i18n';
  import { Modal, Button, controlClass } from '$lib/components/ui';

  export let isOpen: boolean = false;
  export let editTitle: string;
  export let editTestart: string;
  export let editGrade: string = "";
  export let editKlasse: string = "";
  export let editDatum: string;
  export let editNr: string;
  export let editFach: string;
  export let editLehrernachname: string;
  export let editInfoText: string;
  export let editRetentionUntil: string;
  export let editGradingKey: GradingKeyConfig;
  export let onSave: () => void;
  export let onCancel: () => void;

  $: fullCoursePreview = formatExamCourse(editGrade, editKlasse);

  let editDatumDate = "";
  let editDauer = "";
  let lastSyncedEditDatum = "";

  $: if (editDatum !== lastSyncedEditDatum) {
    lastSyncedEditDatum = editDatum;
    const parsed = parseDatumAndDauer(editDatum);
    editDatumDate = parsed.datumDate;
    editDauer = parsed.dauer;
  }

  function handleDatumDateOrDauerChange() {
    const formatted = formatDatumAndDauer(editDatumDate, editDauer);
    editDatum = formatted;
    lastSyncedEditDatum = formatted;
  }

  function handleSave() {
    handleDatumDateOrDauerChange();
    if (editTestart) recordValue("exam.testart", editTestart);
    if (editGrade) recordValue("exam.grade", editGrade);
    if (editKlasse) recordValue("exam.klasse", editKlasse);
    if (editFach) recordValue("exam.fach", editFach);
    if (editLehrernachname) recordValue("exam.lehrernachname", editLehrernachname);
    if (editDauer) recordValue("exam.dauer", editDauer);
    onSave();
  }
</script>

<Modal open={isOpen} size="lg" title={$t("exam.metadataEditor.heading")} onClose={onCancel}>
  <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
    <div class="flex flex-col gap-1">
      <label for="editTitle" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.examTitle")}</label>
      <input id="editTitle" type="text" bind:value={editTitle} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editTestart" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.testart")}</label>
      <SuggestInput id="editTestart" storageKey="exam.testart" bind:value={editTestart} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editGrade" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.grade")}</label>
      <SuggestInput id="editGrade" storageKey="exam.grade" bind:value={editGrade} placeholder="10" class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editKlasse" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.klasse")}</label>
      <SuggestInput id="editKlasse" storageKey="exam.klasse" bind:value={editKlasse} placeholder="a" class={controlClass} />
    </div>
    {#if fullCoursePreview}
      <div class="flex flex-col gap-1 md:col-span-2">
        <div class="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-3 py-2 text-[0.85rem] text-muted">
          <span>{$t("exam.metadataEditor.coursePreview")} <code class="rounded bg-sky-400/10 px-[0.35rem] py-[0.1rem] font-mono text-accent">\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
          <span class="rounded-full border border-sky-400/30 bg-sky-400/15 px-2 py-[0.15rem] font-semibold text-accent">{fullCoursePreview}</span>
        </div>
      </div>
    {/if}
    <div class="flex flex-col gap-1">
      <label for="editDatumDate" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.datum")}</label>
      <input id="editDatumDate" type="text" bind:value={editDatumDate} on:input={handleDatumDateOrDauerChange} placeholder="14.08.2026" class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editDauer" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.dauer")}</label>
      <SuggestInput id="editDauer" storageKey="exam.dauer" bind:value={editDauer} on:input={handleDatumDateOrDauerChange} placeholder="30 Min" class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editNr" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.nr")}</label>
      <input id="editNr" type="text" bind:value={editNr} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editFach" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.fach")}</label>
      <SuggestInput id="editFach" storageKey="exam.fach" bind:value={editFach} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editLehrernachname" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.lehrernachname")}</label>
      <SuggestInput id="editLehrernachname" storageKey="exam.lehrernachname" bind:value={editLehrernachname} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editRetention" class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.retentionUntil")}</label>
      <input id="editRetention" type="date" bind:value={editRetentionUntil} class={controlClass} />
    </div>
  </div>

  <div class="mb-4 flex flex-col gap-1">
    <label class="text-[0.8125rem] text-muted">{$t("exam.metadataEditor.infoText")}</label>
    <LatexEditor bind:value={editInfoText} rows={4} />
  </div>

  <div class="mt-2">
    <GradingKeyEditor bind:gradingKey={editGradingKey} />
  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onCancel}>{$t("common.cancel")}</Button>
    <Button variant="primary" onClick={handleSave}>{$t("common.save")}</Button>
  </svelte:fragment>
</Modal>
