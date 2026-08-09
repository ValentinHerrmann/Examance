<script lang="ts">
  import './StatsExportModal.css';
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<div class="stats-export-modal-overlay" on:click={onCancel}>
  <div class="stats-export-modal-card" on:click|stopPropagation>
    <h3>Confirm Data Export</h3>
    <p>
      You are exporting unencrypted student grade data to CSV.
      An immutable audit log entry will be created capturing this action.
    </p>
    <div class="stats-export-modal-actions">
      <button class="stats-export-modal-cancel-btn" on:click={onCancel}>Cancel</button>
      <button class="stats-export-modal-confirm-btn" on:click={onConfirm}>
        I confirm I am authorized to export this data
      </button>
    </div>
  </div>
</div>
