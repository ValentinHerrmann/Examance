<script lang="ts">
  import "./ClearAnnotationsModal.css";
  import { gradingStore } from "$lib/grading/gradingStore";

  // Destructive action confirm/cancel are callback props out to the parent,
  // which gates the actual clearing behind the user's explicit confirmation.
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

{#if $gradingStore.showClearConfirmModal}
  <div class="clear-annotations-modal-last-sub-backdrop" on:click|self={onCancel} role="dialog">
    <div class="clear-annotations-modal-last-sub-card">
      <div class="clear-annotations-modal-last-sub-icon" style="background: rgba(239, 68, 68, 0.2); color: #ef4444;">
        🗑
      </div>
      <h3>Alle Anmerkungen löschen?</h3>
      <p>
        Möchtest du wirklich alle Zeichnungen und Stempel auf dieser Seite löschen? Dies setzt auch die automatisch berechneten Punkte zurück.
      </p>
      <div class="clear-annotations-modal-modal-btn-group">
        <button
          type="button"
          class="clear-annotations-modal-modal-danger-btn"
          on:click={onConfirm}
        >
          Löschen bestätigen
        </button>
        <button
          type="button"
          class="clear-annotations-modal-modal-secondary-btn"
          on:click={onCancel}
        >
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}
