<script lang="ts">
  import "./GradingActions.css";
  import { gradingStore } from "$lib/grading/gradingStore";

  // Async persistence and navigation stay route-owned; this component only
  // forwards user intent via callback props.
  export let onSave: () => void;
  export let onPrev: () => void;
  export let onNext: () => void;
  export let currentIndex: number;
</script>

<button
  class="grading-actions-save-btn-pinned"
  on:click={onSave}
  disabled={$gradingStore.isSaving}
>
  {$gradingStore.isSaving ? "Speichern..." : "💾 Note & Anmerkungen speichern"}
</button>

<div class="grading-actions-nav-buttons-pinned">
  <button on:click={onPrev} disabled={currentIndex === 0}>◀ Vorheriger</button>
  <button on:click={onNext}>Nächster Schüler ▶</button>
</div>
