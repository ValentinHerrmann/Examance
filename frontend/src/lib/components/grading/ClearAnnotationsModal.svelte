<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";

  // Destructive action confirm/cancel are callback props out to the parent,
  // which gates the actual clearing behind the user's explicit confirmation.
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

{#if $gradingStore.showClearConfirmModal}
  <div class="last-sub-backdrop" on:click|self={onCancel} role="dialog">
    <div class="last-sub-card">
      <div class="last-sub-icon" style="background: rgba(239, 68, 68, 0.2); color: #ef4444;">
        🗑
      </div>
      <h3>Alle Anmerkungen löschen?</h3>
      <p>
        Möchtest du wirklich alle Zeichnungen und Stempel auf dieser Seite löschen? Dies setzt auch die automatisch berechneten Punkte zurück.
      </p>
      <div class="modal-btn-group">
        <button
          type="button"
          class="modal-danger-btn"
          on:click={onConfirm}
        >
          Löschen bestätigen
        </button>
        <button
          type="button"
          class="modal-secondary-btn"
          on:click={onCancel}
        >
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .last-sub-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .last-sub-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 16px;
    padding: 2rem;
    max-width: 420px;
    width: 100%;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .last-sub-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
  }

  .last-sub-card h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 1.25rem;
  }

  .last-sub-card p {
    margin: 0;
    color: #94a3b8;
    font-size: 0.875rem;
  }

  .modal-btn-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    margin-top: 0.5rem;
  }

  .modal-danger-btn {
    width: 100%;
    padding: 0.65rem 1rem;
    background: #dc2626;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .modal-danger-btn:hover {
    background: #b91c1c;
  }

  .modal-secondary-btn {
    width: 100%;
    padding: 0.55rem 1rem;
    background: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .modal-secondary-btn:hover {
    background: #475569;
    color: #ffffff;
  }
</style>
