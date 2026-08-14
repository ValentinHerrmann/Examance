<script lang="ts">
  import "./ExamMetadataForm.css";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  export let title: string;
  export let testart: string;
  export let klasse: string;
  export let nr: string;
  export let datum: string;
  export let fach: string;
  export let lehrernachname: string;
  export let infoText: string;
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

  <div class="exam-metadata-form-grid-3">
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
      <label for="klasse">Klasse (\Klasse)</label>
      <SuggestInput
        id="klasse"
        storageKey="exam.klasse"
        bind:value={klasse}
        placeholder="10a"
        required
      />
    </div>

    <div class="exam-metadata-form-group">
      <label for="nr">Nummer (\Nr)</label>
      <input id="nr" type="text" bind:value={nr} placeholder="1" required />
    </div>
  </div>

  <div class="exam-metadata-form-grid-3">
    <div class="exam-metadata-form-group">
      <label for="datum">Datum & Dauer (\Datum)</label>
      <input
        id="datum"
        type="text"
        bind:value={datum}
        placeholder="20.05.2025 (30 Min)"
        required
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
