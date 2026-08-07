<script lang="ts">
  import "./LastSubmissionModal.css";
  import { gradingStore } from "$lib/grading/gradingStore";

  export let examId: string;
  export let onStay: () => void;
</script>

{#if $gradingStore.showLastSubModal}
  <div class="last-submission-modal-last-sub-backdrop">
    <div class="last-submission-modal-last-sub-card">
      <div class="last-submission-modal-last-sub-icon">
        🏁
      </div>
      <h3>Ende der Arbeiten</h3>
      <p>
        Du hast die letzte Arbeit dieser Prüfung erreicht. Alle vorliegenden Abgaben wurden korrigiert.
      </p>
      <div class="last-submission-modal-modal-btn-group">
        <a href="/exam/{examId}" class="last-submission-modal-modal-primary-btn">
          Zurück zur Prüfungsübersicht
        </a>
        <button
          type="button"
          class="last-submission-modal-modal-secondary-btn"
          on:click={onStay}
        >
          Auf dieser Seite bleiben
        </button>
      </div>
    </div>
  </div>
{/if}
