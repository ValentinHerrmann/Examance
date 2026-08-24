<script lang="ts">
  import { timeUntilLock, keepSessionAlive } from '$lib/db/hygiene';
  import { t } from '$lib/i18n';
  import { Modal, Button } from '$lib/components/ui';

  $: formattedTime = $timeUntilLock !== null
    ? $t('auth.sessionTimeout.minutesSeconds', { minutes: Math.floor($timeUntilLock / 60), seconds: $timeUntilLock % 60 })
    : '';
</script>

<Modal
  open={$timeUntilLock !== null}
  size="sm"
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <div class="text-center">
    <div class="mb-2 text-[2.5rem]">⏳</div>
    <h3 class="m-0 mb-3 text-[1.35rem] text-yellow-200">{$t('auth.sessionTimeout.title')}</h3>
    <p class="mb-6 text-[0.95rem] leading-normal text-muted">
      {$t('auth.sessionTimeout.messageBefore')}
      <strong>{formattedTime}</strong>
      {$t('auth.sessionTimeout.messageAfter')}
    </p>
    <div class="flex justify-center">
      <Button onClick={keepSessionAlive}>
        {$t('auth.sessionTimeout.keepAlive')}
      </Button>
    </div>
  </div>
</Modal>
