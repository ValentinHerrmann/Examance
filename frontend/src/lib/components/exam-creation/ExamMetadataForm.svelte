<script lang="ts">
  export let title: string;
  export let testart: string;
  export let klasse: string;
  export let nr: string;
  export let datum: string;
  export let fach: string;
  export let lehrernachname: string;
  export let infoText: string;
</script>

<div class="section-card">
  <h3>1. Exam Metadata</h3>

  <div class="form-group">
    <label for="title">Exam Title</label>
    <input
      id="title"
      type="text"
      bind:value={title}
      placeholder="e.g. 2. Kurzarbeit 10a Informatik"
      required
    />
  </div>

  <div class="form-grid-3">
    <div class="form-group">
      <label for="testart">Testart (\Testart)</label>
      <input
        id="testart"
        type="text"
        bind:value={testart}
        placeholder="Kurzarbeit"
        required
      />
    </div>

    <div class="form-group">
      <label for="klasse">Klasse (\Klasse)</label>
      <input
        id="klasse"
        type="text"
        bind:value={klasse}
        placeholder="10a"
        required
      />
    </div>

    <div class="form-group">
      <label for="nr">Nummer (\Nr)</label>
      <input id="nr" type="text" bind:value={nr} placeholder="1" required />
    </div>
  </div>

  <div class="form-grid-3">
    <div class="form-group">
      <label for="datum">Datum & Dauer (\Datum)</label>
      <input
        id="datum"
        type="text"
        bind:value={datum}
        placeholder="20.05.2025 (30 Min)"
        required
      />
    </div>

    <div class="form-group">
      <label for="fach">Fach (\Fach)</label>
      <input
        id="fach"
        type="text"
        bind:value={fach}
        placeholder="Informatik"
        required
      />
    </div>

    <div class="form-group">
      <label for="lehrer">Lehrer Nachname (\Lehrernachname)</label>
      <input
        id="lehrer"
        type="text"
        bind:value={lehrernachname}
        placeholder="Her"
        required
      />
    </div>
  </div>

  <div class="form-group">
    <label for="info">Header Info Instructions (\Info)</label>
    <textarea id="info" rows="2" bind:value={infoText}></textarea>
  </div>
</div>

<style>
  .section-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .section-card h3 {
    margin-top: 0;
    color: #f8fafc;
    font-size: 1.1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  .form-grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
  }

  label {
    font-size: 0.875rem;
    color: #cbd5e1;
  }

  input,
  textarea {
    padding: 0.625rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: white;
  }
</style>
