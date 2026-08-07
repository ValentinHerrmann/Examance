<script lang="ts">
  import "./VariantModal.css";
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
    class="variant-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === "Escape" && onRequestClose()}
  >
    <div class="variant-modal-content">
      <div class="variant-modal-header">
        <h3>Create Parallel Exercise Variant</h3>
        <button class="variant-modal-close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="variant-modal-body">
        <p class="variant-modal-desc-text">
          Variants share the same exercise group metadata but use a different
          theme (e.g. Möbel, Fahrzeug, Wildtier).
        </p>

        <div class="variant-modal-live-notice" style="margin-bottom: 1rem;">
          📌 Group Context: <strong>{variantBaseEx.name}</strong> ({variantBaseEx.topicTag || '_General'}{variantBaseEx.grade ? `, Klasse ${variantBaseEx.grade}` : ''})
        </div>

        <div class="variant-modal-form-group">
          <label for="variantKey">Variant Theme / Key</label>
          <input
            id="variantKey"
            type="text"
            bind:value={variantKey}
            placeholder="e.g. Moebel, Fahrzeug, Wildtier"
            required
          />
        </div>

        <div class="variant-modal-form-group">
          <label for="variantBody"
            >LaTeX Body (\\begin&#123;Aufgabe&#125;...)</label
          >
          <LatexEditor bind:value={variantLatexBody} rows={8} />
        </div>
      </div>

      <div class="variant-modal-footer">
        <button class="variant-modal-cancel-btn" on:click={onRequestClose}>Cancel</button>
        <button class="variant-modal-save-btn" on:click={onSave}>Save Variant</button>
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
