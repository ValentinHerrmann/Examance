<script lang="ts">
  import "./ExamMetadataForm.css";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from "$lib/utils/examLabel";
  export let title: string;
  export let testart: string;
  export let grade: string = "";
  export let klasse: string = "";
  export let nr: string;
  export let datum: string;
  export let fach: string;
  export let lehrernachname: string;
  export let infoText: string;

  $: fullCoursePreview = formatExamCourse(grade, klasse);

  let datumDate = "";
  let dauer = "";
  let lastSyncedDatum = "";

  $: if (datum !== lastSyncedDatum) {
    lastSyncedDatum = datum;
    const parsed = parseDatumAndDauer(datum);
    datumDate = parsed.datumDate;
    dauer = parsed.dauer;
  }

  function handleDatumDateOrDauerChange() {
    const formatted = formatDatumAndDauer(datumDate, dauer);
    datum = formatted;
    lastSyncedDatum = formatted;
  }
</script>

<div class="exam-metadata-form-card">
  <h3>1. Exam Metadata</h3>

  <div class="exam-metadata-form-group">
    <label for="title">Exam Title</label>
    <input
      id="title"
      type="text"
      bind:value={title}
      placeholder="e.g. 2. Kurzarbeit 10a Informatik"
      required
    />
  </div>

  <div class="exam-metadata-form-grid-4">
    <div class="exam-metadata-form-group">
      <label for="testart">Testart (\Testart)</label>
      <SuggestInput
        id="testart"
        storageKey="exam.testart"
        bind:value={testart}
        placeholder="Kurzarbeit"
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="grade">Jahrgangsstufe (Grade)</label>
      <SuggestInput
        id="grade"
        storageKey="exam.grade"
        bind:value={grade}
        placeholder="10"
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="klasse">Klasse / Kurs</label>
      <SuggestInput
        id="klasse"
        storageKey="exam.klasse"
        bind:value={klasse}
        placeholder="a"
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="nr">Nummer (\Nr)</label>
      <input id="nr" type="text" bind:value={nr} placeholder="1" required />
    </div>
  </div>

  {#if fullCoursePreview}
    <div class="course-preview-badge">
      <span>Vorschau <code>\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
      <span class="preview-badge-value">{fullCoursePreview}</span>
    </div>
  {/if}

  <div class="exam-metadata-form-grid-4">
    <div class="exam-metadata-form-group">
      <label for="datumDate">Datum (\Datum)</label>
      <input
        id="datumDate"
        type="text"
        bind:value={datumDate}
        on:input={handleDatumDateOrDauerChange}
        placeholder="20.05.2025"
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="dauer">Dauer</label>
      <SuggestInput
        id="dauer"
        storageKey="exam.dauer"
        bind:value={dauer}
        on:input={handleDatumDateOrDauerChange}
        placeholder="30 Min"
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="fach">Fach (\Fach)</label>
      <SuggestInput
        id="fach"
        storageKey="exam.fach"
        bind:value={fach}
        placeholder="Informatik"
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="lehrer">Lehrer Nachname (\Lehrernachname)</label>
      <SuggestInput
        id="lehrer"
        storageKey="exam.lehrernachname"
        bind:value={lehrernachname}
        placeholder="Her"
        required
      />
    </div>
  </div>

  <div class="exam-metadata-form-group">
    <label for="info">Header Info Instructions (\Info)</label>
    <textarea id="info" rows="2" bind:value={infoText}></textarea>
  </div>
</div>

