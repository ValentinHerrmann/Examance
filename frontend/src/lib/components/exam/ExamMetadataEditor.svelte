<script lang="ts">
  import "./ExamMetadataEditor.css";
  import type { GradingKeyConfig } from '$lib/db/schema';
  import GradingKeyEditor from '$lib/components/GradingKeyEditor.svelte';
  import LatexEditor from '$lib/components/LatexEditor.svelte';
  import SuggestInput from '$lib/components/common/SuggestInput.svelte';
  import { recordValue } from '$lib/utils/recentValues';
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from '$lib/utils/examLabel';
  import { t } from '$lib/i18n';

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

{#if isOpen}
  <div class="eme-modal-overlay" on:click={onCancel}>
    <div class="eme-editor-modal" on:click|stopPropagation>
      <div class="eme-modal-header">
        <h3>{$t("exam.metadataEditor.heading")}</h3>
        <button class="eme-close-btn" on:click={onCancel}>✕</button>
      </div>

      <div class="eme-editor-content">
        <div class="eme-form-grid">
          <div class="eme-form-group">
            <label for="editTitle">{$t("exam.metadataEditor.examTitle")}</label>
            <input id="editTitle" type="text" bind:value={editTitle} />
          </div>
          <div class="eme-form-group">
            <label for="editTestart">{$t("exam.metadataEditor.testart")}</label>
            <SuggestInput id="editTestart" storageKey="exam.testart" bind:value={editTestart} />
          </div>
          <div class="eme-form-group">
            <label for="editGrade">{$t("exam.metadataEditor.grade")}</label>
            <SuggestInput id="editGrade" storageKey="exam.grade" bind:value={editGrade} placeholder="10" />
          </div>
          <div class="eme-form-group">
            <label for="editKlasse">{$t("exam.metadataEditor.klasse")}</label>
            <SuggestInput id="editKlasse" storageKey="exam.klasse" bind:value={editKlasse} placeholder="a" />
          </div>
        {#if fullCoursePreview}
          <div class="eme-form-group eme-full-width">
            <div class="eme-course-preview">
              <span class="eme-preview-label">{$t("exam.metadataEditor.coursePreview")} <code>\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
              <span class="eme-preview-badge">{fullCoursePreview}</span>
            </div>
          </div>
        {/if}
          <div class="eme-form-group">
            <label for="editDatumDate">{$t("exam.metadataEditor.datum")}</label>
            <input id="editDatumDate" type="text" bind:value={editDatumDate} on:input={handleDatumDateOrDauerChange} placeholder="14.08.2026" />
          </div>
          <div class="eme-form-group">
            <label for="editDauer">{$t("exam.metadataEditor.dauer")}</label>
            <SuggestInput id="editDauer" storageKey="exam.dauer" bind:value={editDauer} on:input={handleDatumDateOrDauerChange} placeholder="30 Min" />
          </div>
          <div class="eme-form-group">
            <label for="editNr">{$t("exam.metadataEditor.nr")}</label>
            <input id="editNr" type="text" bind:value={editNr} />
          </div>
          <div class="eme-form-group">
            <label for="editFach">{$t("exam.metadataEditor.fach")}</label>
            <SuggestInput id="editFach" storageKey="exam.fach" bind:value={editFach} />
          </div>
          <div class="eme-form-group">
            <label for="editLehrernachname">{$t("exam.metadataEditor.lehrernachname")}</label>
            <SuggestInput id="editLehrernachname" storageKey="exam.lehrernachname" bind:value={editLehrernachname} />
          </div>
          <div class="eme-form-group">
            <label for="editRetention">{$t("exam.metadataEditor.retentionUntil")}</label>
            <input id="editRetention" type="date" bind:value={editRetentionUntil} />
          </div>
        </div>

        <div class="eme-form-group eme-full-width">
          <label>{$t("exam.metadataEditor.infoText")}</label>
          <div class="eme-latex-editor-wrap">
            <LatexEditor bind:value={editInfoText} rows={4} />
          </div>
        </div>

        <div class="grading-key-block">
          <GradingKeyEditor bind:gradingKey={editGradingKey} />
        </div>
      </div>

      <div class="eme-modal-footer">
        <button class="eme-btn-cancel" on:click={onCancel}>{$t("common.cancel")}</button>
        <button class="eme-btn-save" on:click={handleSave}>{$t("common.save")}</button>
      </div>
    </div>
  </div>
{/if}

