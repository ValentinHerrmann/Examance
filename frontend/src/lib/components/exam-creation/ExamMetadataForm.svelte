<script lang="ts">
  import "./ExamMetadataForm.css";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from "$lib/utils/examLabel";
  import { t } from "$lib/i18n";
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
  <h3>{$t("examCreation.metadataForm.heading")}</h3>

  <div class="exam-metadata-form-group">
    <label for="title">{$t("examCreation.metadataForm.titleLabel")}</label>
    <input
      id="title"
      type="text"
      bind:value={title}
      placeholder={$t("examCreation.metadataForm.titlePlaceholder")}
      required
    />
  </div>

  <div class="exam-metadata-form-grid-4">
    <div class="exam-metadata-form-group">
      <label for="testart">{$t("examCreation.metadataForm.testartLabel")}</label>
      <SuggestInput
        id="testart"
        storageKey="exam.testart"
        bind:value={testart}
        placeholder={$t("examCreation.metadataForm.testartPlaceholder")}
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="grade">{$t("examCreation.metadataForm.gradeLabel")}</label>
      <SuggestInput
        id="grade"
        storageKey="exam.grade"
        bind:value={grade}
        placeholder={$t("examCreation.metadataForm.gradePlaceholder")}
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="klasse">{$t("examCreation.metadataForm.klasseLabel")}</label>
      <SuggestInput
        id="klasse"
        storageKey="exam.klasse"
        bind:value={klasse}
        placeholder={$t("examCreation.metadataForm.klassePlaceholder")}
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="nr">{$t("examCreation.metadataForm.nrLabel")}</label>
      <input id="nr" type="text" bind:value={nr} placeholder={$t("examCreation.metadataForm.nrPlaceholder")} required />
    </div>
  </div>

  {#if fullCoursePreview}
    <div class="course-preview-badge">
      <span>{$t("examCreation.metadataForm.coursePreviewLabel")} <code>\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
      <span class="preview-badge-value">{fullCoursePreview}</span>
    </div>
  {/if}

  <div class="exam-metadata-form-grid-4">
    <div class="exam-metadata-form-group">
      <label for="datumDate">{$t("examCreation.metadataForm.datumLabel")}</label>
      <input
        id="datumDate"
        type="text"
        bind:value={datumDate}
        on:input={handleDatumDateOrDauerChange}
        placeholder={$t("examCreation.metadataForm.datumPlaceholder")}
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="dauer">{$t("examCreation.metadataForm.dauerLabel")}</label>
      <SuggestInput
        id="dauer"
        storageKey="exam.dauer"
        bind:value={dauer}
        on:input={handleDatumDateOrDauerChange}
        placeholder={$t("examCreation.metadataForm.dauerPlaceholder")}
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="fach">{$t("examCreation.metadataForm.fachLabel")}</label>
      <SuggestInput
        id="fach"
        storageKey="exam.fach"
        bind:value={fach}
        placeholder={$t("examCreation.metadataForm.fachPlaceholder")}
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="lehrer">{$t("examCreation.metadataForm.lehrerLabel")}</label>
      <SuggestInput
        id="lehrer"
        storageKey="exam.lehrernachname"
        bind:value={lehrernachname}
        placeholder={$t("examCreation.metadataForm.lehrerPlaceholder")}
        required
      />
    </div>
  </div>

  <div class="exam-metadata-form-group">
    <label for="info">{$t("examCreation.metadataForm.infoLabel")}</label>
    <textarea id="info" rows="2" bind:value={infoText}></textarea>
  </div>
</div>

