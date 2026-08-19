<script lang="ts">
  import './StatsExportModal.css';
  import { t } from '$lib/i18n';
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<div class="stats-export-modal-overlay" on:click={onCancel}>
  <div class="stats-export-modal-card" on:click|stopPropagation>
    <h3>{$t('stats.exportModal.title')}</h3>
    <p>
      {$t('stats.exportModal.body')}
    </p>
    <div class="stats-export-modal-actions">
      <button class="stats-export-modal-cancel-btn" on:click={onCancel}>{$t('common.cancel')}</button>
      <button class="stats-export-modal-confirm-btn" on:click={onConfirm}>
        {$t('stats.exportModal.confirmButton')}
      </button>
    </div>
  </div>
</div>
