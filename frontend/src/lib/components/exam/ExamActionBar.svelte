<script lang="ts">
  export let examId: string;
  export let onEdit: () => void;
  export let onDelete: () => void;
  export let onExport: () => void;
  export let onScan: () => void;
  export let onGrade: () => void;
  export let onStats: () => void;
  export let onAddExercises: () => void;
  export let onDeleteAllSubmissions: () => void;
  export let storagePolicy: string;
</script>

<div class="exam-actions">
  <div class="actions-left">
    <button class="action-btn primary" on:click={onAddExercises}>
      + Aufgaben hinzufügen
    </button>
    {#if storagePolicy === 'all-local'}
      <button class="action-btn secondary" on:click={onScan}>
        📷 Scannen
      </button>
    {/if}
  </div>

  <div class="actions-right">
    <button class="action-btn secondary" on:click={onGrade}>
      ✏️ Korrigieren
    </button>
    <button class="action-btn secondary" on:click={onStats}>
      📊 Statistik
    </button>
    <button class="action-btn secondary" on:click={onEdit}>
      ⚙️ Bearbeiten
    </button>
    <button class="action-btn danger" on:click={onDeleteAllSubmissions}>
      🗑️ Abgaben löschen
    </button>
    <button class="action-btn danger" on:click={onExport}>
      ↓ Export
    </button>
    <button class="action-btn danger" on:click={onDelete}>
      ✕ Löschen
    </button>
  </div>
</div>

<style>
  .exam-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .actions-left,
  .actions-right {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .action-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .primary {
    background: #0284c7;
    color: white;
  }

  .primary:hover {
    background: #0369a1;
  }

  .secondary {
    background: #334155;
    color: #f8fafc;
  }

  .secondary:hover {
    background: #475569;
  }

  .danger {
    background: #991b1b;
    color: white;
  }

  .danger:hover {
    background: #7f1d1d;
  }
</style>
