<script lang="ts">
  import type { GradingKeyConfig } from '$lib/db/schema';
  import GradingKeyEditor from '$lib/components/GradingKeyEditor.svelte';

  export let isOpen: boolean = false;
  export let editTitle: string;
  export let editTestart: string;
  export let editKlasse: string;
  export let editDatum: string;
  export let editNr: string;
  export let editFach: string;
  export let editLehrernachname: string;
  export let editInfoText: string;
  export let editRetentionUntil: string;
  export let editGradingKey: GradingKeyConfig;
  export let onSave: () => void;
  export let onCancel: () => void;
</script>

{#if isOpen}
  <div class="modal-overlay" on:click={onCancel}>
    <div class="editor-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Prüfung bearbeiten</h3>
        <button class="close-btn" on:click={onCancel}>✕</button>
      </div>

      <div class="editor-content">
        <div class="form-grid">
          <div class="form-group">
            <label for="editTitle">Exam Title</label>
            <input id="editTitle" type="text" bind:value={editTitle} />
          </div>
          <div class="form-group">
            <label for="editTestart">Testart</label>
            <input id="editTestart" type="text" bind:value={editTestart} />
          </div>
          <div class="form-group">
            <label for="editKlasse">Klasse</label>
            <input id="editKlasse" type="text" bind:value={editKlasse} />
          </div>
          <div class="form-group">
            <label for="editDatum">Datum / Dauer</label>
            <input id="editDatum" type="text" bind:value={editDatum} />
          </div>
          <div class="form-group">
            <label for="editNr">Prüfungsnummer (Nr)</label>
            <input id="editNr" type="text" bind:value={editNr} />
          </div>
          <div class="form-group">
            <label for="editFach">Fach</label>
            <input id="editFach" type="text" bind:value={editFach} />
          </div>
          <div class="form-group">
            <label for="editLehrernachname">Lehrernachname</label>
            <input id="editLehrernachname" type="text" bind:value={editLehrernachname} />
          </div>
          <div class="form-group">
            <label for="editRetention">Retention Until</label>
            <input id="editRetention" type="date" bind:value={editRetentionUntil} />
          </div>
        </div>

        <div class="form-group full-width">
          <label for="editInfoText">Info Text (LaTeX list)</label>
          <textarea id="editInfoText" rows="4" bind:value={editInfoText}></textarea>
        </div>

        <div class="grading-key-block">
          <GradingKeyEditor bind:gradingKey={editGradingKey} />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" on:click={onCancel}>Abbrechen</button>
        <button class="btn-save" on:click={onSave}>Speichern</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .editor-modal {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    width: min(96vw, 720px);
    max-width: 720px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #334155;
  }

  h3 {
    margin: 0;
    color: #38bdf8;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.25rem;
    cursor: pointer;
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }

  .form-group.full-width {
    grid-column: span 2;
  }

  .form-group label {
    font-size: 0.8125rem;
    color: #94a3b8;
  }

  .form-group input,
  .form-group textarea {
    background: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-family: inherit;
  }

  .grading-key-block {
    margin-top: 0.5rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #334155;
  }

  .btn-cancel {
    padding: 0.5rem 1rem;
    background: #475569;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-save {
    padding: 0.5rem 1.25rem;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
