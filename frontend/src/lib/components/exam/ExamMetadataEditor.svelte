<script lang="ts">
  import "./ExamMetadataEditor.css";
  import type { GradingKeyConfig } from '$lib/db/schema';
  import GradingKeyEditor from '$lib/components/GradingKeyEditor.svelte';
  import LatexEditor from '$lib/components/LatexEditor.svelte';

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
            <input id="editTestart" type="text" bind:value={editTestart} />
          </div>
          <div class="eme-form-group">
            <label for="editKlasse">Klasse</label>
            <input id="editKlasse" type="text" bind:value={editKlasse} />
          </div>
          <div class="eme-form-group">
            <label for="editDatum">Datum / Dauer</label>
            <input id="editDatum" type="text" bind:value={editDatum} />
          </div>
          <div class="eme-form-group">
            <label for="editNr">Prüfungsnummer (Nr)</label>
            <input id="editNr" type="text" bind:value={editNr} />
          </div>
          <div class="eme-form-group">
            <label for="editFach">Fach</label>
            <input id="editFach" type="text" bind:value={editFach} />
          </div>
          <div class="eme-form-group">
            <label for="editLehrernachname">Lehrernachname</label>
            <input id="editLehrernachname" type="text" bind:value={editLehrernachname} />
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
        <button class="eme-btn-save" on:click={onSave}>Speichern</button>
      </div>
    </div>
  </div>
{/if}
