<script lang="ts">
  import "./ExamMetadataEditor.css";
  import type { GradingKeyConfig } from '$lib/db/schema';
  import GradingKeyEditor from '$lib/components/GradingKeyEditor.svelte';
  import LatexEditor from '$lib/components/LatexEditor.svelte';
  import SuggestInput from '$lib/components/common/SuggestInput.svelte';
  import { recordValue } from '$lib/utils/recentValues';
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from '$lib/utils/examLabel';

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
        <h3>Prüfung bearbeiten</h3>
        <button class="eme-close-btn" on:click={onCancel}>✕</button>
      </div>

      <div class="eme-editor-content">
        <div class="eme-form-grid">
          <div class="eme-form-group">
            <label for="editTitle">Exam Title</label>
            <input id="editTitle" type="text" bind:value={editTitle} />
          </div>
          <div class="eme-form-group">
            <label for="editTestart">Testart</label>
            <SuggestInput id="editTestart" storageKey="exam.testart" bind:value={editTestart} />
          </div>
          <div class="eme-form-group">
            <label for="editGrade">Jahrgangsstufe (Grade)</label>
            <SuggestInput id="editGrade" storageKey="exam.grade" bind:value={editGrade} placeholder="10" />
          </div>
          <div class="eme-form-group">
            <label for="editKlasse">Klasse / Kurs</label>
            <SuggestInput id="editKlasse" storageKey="exam.klasse" bind:value={editKlasse} placeholder="a" />
          </div>
        {#if fullCoursePreview}
          <div class="eme-form-group eme-full-width">
            <div class="eme-course-preview">
              <span class="eme-preview-label">Vorschau <code>\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
              <span class="eme-preview-badge">{fullCoursePreview}</span>
            </div>
          </div>
        {/if}
          <div class="eme-form-group">
            <label for="editDatumDate">Datum (\Datum)</label>
            <input id="editDatumDate" type="text" bind:value={editDatumDate} on:input={handleDatumDateOrDauerChange} placeholder="14.08.2026" />
          </div>
          <div class="eme-form-group">
            <label for="editDauer">Dauer</label>
            <SuggestInput id="editDauer" storageKey="exam.dauer" bind:value={editDauer} on:input={handleDatumDateOrDauerChange} placeholder="30 Min" />
          </div>
          <div class="eme-form-group">
            <label for="editNr">Prüfungsnummer (Nr)</label>
            <input id="editNr" type="text" bind:value={editNr} />
          </div>
          <div class="eme-form-group">
            <label for="editFach">Fach</label>
            <SuggestInput id="editFach" storageKey="exam.fach" bind:value={editFach} />
          </div>
          <div class="eme-form-group">
            <label for="editLehrernachname">Lehrernachname</label>
            <SuggestInput id="editLehrernachname" storageKey="exam.lehrernachname" bind:value={editLehrernachname} />
          </div>
          <div class="eme-form-group">
            <label for="editRetention">Retention Until</label>
            <input id="editRetention" type="date" bind:value={editRetentionUntil} />
          </div>
        </div>

        <div class="eme-form-group eme-full-width">
          <label>Info Text (LaTeX list)</label>
          <div class="eme-latex-editor-wrap">
            <LatexEditor bind:value={editInfoText} rows={4} />
          </div>
        </div>

        <div class="grading-key-block">
          <GradingKeyEditor bind:gradingKey={editGradingKey} />
        </div>
      </div>

      <div class="eme-modal-footer">
        <button class="eme-btn-cancel" on:click={onCancel}>Abbrechen</button>
        <button class="eme-btn-save" on:click={handleSave}>Speichern</button>
      </div>
    </div>
  </div>
{/if}

