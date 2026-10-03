<script lang="ts">
  import { t } from '$lib/i18n';
  import { Modal, Button } from '$lib/components/ui';

  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<Modal open={true} size="small" title={$t('stats.exportModal.title')} onClose={onCancel}>
  <p class="text-content">
    {$t('stats.exportModal.body')}
  </p>

  <svelte:fragment slot="footer">
    <Button variant="outlined" severity="secondary" onClick={onCancel}>{$t('common.cancel')}</Button>
    <Button onClick={onConfirm}>
      {$t('stats.exportModal.confirmButton')}
    </Button>
  </svelte:fragment>
</Modal>
