<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

  export let isOpen = false;
  export let variantBaseEx: ExerciseRecord | null = null;
  export let variantKey = "";
  export let variantLatexBody = "";
  export let showConfirmClose = false;
  export let onRequestClose: () => void;
  export let onSave: () => void;
  export let onForceCloseConfirm: () => void;
  export let onCancelConfirmClose: () => void;
</script>

{#if isOpen && variantBaseEx}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === "Escape" && onRequestClose()}
  >
    <div class="modal-content">
      <div class="modal-header">
        <h3>Create Parallel Exercise Variant</h3>
        <button class="close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="modal-body">
        <p class="desc-text">
          Variants share the same exercise group metadata but use a different
          theme (e.g. Möbel, Fahrzeug, Wildtier).
        </p>

        <div class="live-notice" style="margin-bottom: 1rem;">
          📌 Group Context: <strong>{variantBaseEx.name}</strong> ({variantBaseEx.topicTag || '_General'}{variantBaseEx.grade ? `, Klasse ${variantBaseEx.grade}` : ''})
        </div>

        <div class="form-group">
          <label for="variantKey">Variant Theme / Key</label>
          <input
            id="variantKey"
            type="text"
            bind:value={variantKey}
            placeholder="e.g. Moebel, Fahrzeug, Wildtier"
            required
          />
        </div>

        <div class="form-group">
          <label for="variantBody"
            >LaTeX Body (\\begin&#123;Aufgabe&#125;...)</label
          >
          <LatexEditor bind:value={variantLatexBody} rows={8} />
        </div>
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" on:click={onRequestClose}>Cancel</button>
        <button class="save-btn" on:click={onSave}>Save Variant</button>
      </div>
    </div>
  </div>
{/if}

<ConfirmDialog
  isOpen={showConfirmClose}
  title="Discard Variant Changes?"
  message="You have unsaved changes in this variant form. Discarding will lose your changes."
  confirmText="Discard Changes"
  cancelText="Keep Editing"
  on:confirm={onForceCloseConfirm}
  on:cancel={onCancelConfirmClose}
/>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
  }

  .modal-content {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #334155;
  }

  .modal-header h3 {
    margin: 0;
    color: #38bdf8;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.25rem;
    cursor: pointer;
  }

  .live-notice {
    background: rgba(2, 132, 199, 0.2);
    color: #7dd3fc;
    padding: 0.5rem 1.5rem;
    font-size: 0.85rem;
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  label {
    font-size: 0.875rem;
    color: #cbd5e1;
  }

  input {
    padding: 0.625rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: white;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #334155;
  }

  .cancel-btn {
    background: #334155;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .save-btn {
    background: #16a34a;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .desc-text {
    font-size: 0.875rem;
    color: #94a3b8;
    margin: 0 0 1rem 0;
  }
</style>
