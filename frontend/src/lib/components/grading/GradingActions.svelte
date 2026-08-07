<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";

  // Async persistence and navigation stay route-owned; this component only
  // forwards user intent via callback props.
  export let onSave: () => void;
  export let onPrev: () => void;
  export let onNext: () => void;
  export let currentIndex: number;
</script>

<button
  class="save-btn-pinned"
  on:click={onSave}
  disabled={$gradingStore.isSaving}
>
  {$gradingStore.isSaving ? "Speichern..." : "💾 Note & Anmerkungen speichern"}
</button>

<div class="nav-buttons-pinned">
  <button on:click={onPrev} disabled={currentIndex === 0}>◀ Vorheriger</button>
  <button on:click={onNext}>Nächster Schüler ▶</button>
</div>

<style>
  .save-btn-pinned {
    width: 100%;
    padding: 0.5rem;
    background: #0284c7;
    color: white;
    font-weight: 600;
    font-size: 0.825rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .save-btn-pinned:hover:not(:disabled) {
    background: #0369a1;
  }

  .save-btn-pinned:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .nav-buttons-pinned {
    display: flex;
    gap: 0.5rem;
  }

  .nav-buttons-pinned button {
    flex: 1;
    padding: 0.4rem 0.5rem;
    background: #334155;
    color: #cbd5e1;
    border: none;
    border-radius: 6px;
    font-size: 0.775rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .nav-buttons-pinned button:hover:not(:disabled) {
    background: #475569;
    color: #f8fafc;
  }

  .nav-buttons-pinned button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
