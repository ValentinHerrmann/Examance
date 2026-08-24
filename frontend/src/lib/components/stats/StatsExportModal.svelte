<script lang="ts">
  import { t } from '$lib/i18n';
  import { Modal, Button } from '$lib/components/ui';

  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<Modal open={true} size="sm" title={$t('stats.exportModal.title')} onClose={onCancel}>
  <p class="text-content/90">
    {$t('stats.exportModal.body')}
  </p>

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onCancel}>{$t('common.cancel')}</Button>
    <Button variant="primary" onClick={onConfirm}>
      {$t('stats.exportModal.confirmButton')}
    </Button>
  </svelte:fragment>
</Modal>
