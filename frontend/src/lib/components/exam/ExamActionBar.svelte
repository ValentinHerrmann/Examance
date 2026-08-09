<script lang="ts">
  import "./ExamActionBar.css";
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
    <button class="eab-btn eab-primary" on:click={onAddExercises}>
      + Aufgaben hinzufügen
    </button>
    {#if storagePolicy === 'all-local'}
      <button class="eab-btn eab-secondary" on:click={onScan}>
        📷 Scannen
      </button>
    {/if}
  </div>

  <div class="actions-right">
    <button class="eab-btn eab-secondary" on:click={onGrade}>
      ✏️ Korrigieren
    </button>
    <button class="eab-btn eab-secondary" on:click={onStats}>
      📊 Statistik
    </button>
    <button class="eab-btn eab-secondary" on:click={onEdit}>
      ⚙️ Bearbeiten
    </button>
    <button class="eab-btn eab-danger" on:click={onDeleteAllSubmissions}>
      🗑️ Abgaben löschen
    </button>
    <button class="eab-btn eab-danger" on:click={onExport}>
      ↓ Export
    </button>
    <button class="eab-btn eab-danger" on:click={onDelete}>
      ✕ Löschen
    </button>
  </div>
</div>
