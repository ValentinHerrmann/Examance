<script lang="ts">
  import { t } from '#lib/i18n';
  import { Modal, Button } from '#lib/components/ui';

  interface Props {
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { onConfirm, onCancel }: Props = $props();
</script>

<Modal open={true} size="small" title={$t('stats.exportModal.title')} onClose={onCancel}>
  <p class="text-content">
    {$t('stats.exportModal.body')}
  </p>

  {#snippet footer()}

      <Button variant="outlined" severity="secondary" onClick={onCancel}>{$t('common.cancel')}</Button>
      <Button onClick={onConfirm}>
        {$t('stats.exportModal.confirmButton')}
      </Button>

  {/snippet}
</Modal>
