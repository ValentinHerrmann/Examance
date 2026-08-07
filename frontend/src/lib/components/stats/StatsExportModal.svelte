<script lang="ts">
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<div class="modal-overlay" on:click={onCancel}>
  <div class="modal-card" on:click|stopPropagation>
    <h3>Confirm Data Export</h3>
    <p>
      You are exporting unencrypted student grade data to CSV.
      An immutable audit log entry will be created capturing this action.
    </p>
    <div class="modal-actions">
      <button class="cancel-btn" on:click={onCancel}>Cancel</button>
      <button class="confirm-btn" on:click={onConfirm}>
        I confirm I am authorized to export this data
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-card {
    background: #1e293b;
    padding: 2rem;
    border-radius: 10px;
    max-width: 450px;
    width: 90%;
    border: 1px solid #334155;
  }

  .modal-card h3 {
    color: #38bdf8;
    margin-top: 0;
  }

  .modal-card p {
    color: #cbd5e1;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .cancel-btn,
  .confirm-btn {
    padding: 0.625rem 1rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    color: white;
  }

  .cancel-btn {
    background: #334155;
  }

  .cancel-btn:hover {
    background: #475569;
  }

  .confirm-btn {
    background: #0284c7;
  }

  .confirm-btn:hover {
    background: #0369a1;
  }
</style>
