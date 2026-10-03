<script lang="ts">
  import { timeUntilLock, keepSessionAlive } from '$lib/db/hygiene';
  import { t } from '$lib/i18n';
  import { faHourglassHalf } from '@fortawesome/free-solid-svg-icons';
  import { Modal, Button, Icon } from '$lib/components/ui';

  $: formattedTime = $timeUntilLock !== null
    ? $t('auth.sessionTimeout.minutesSeconds', { minutes: Math.floor($timeUntilLock / 60), seconds: $timeUntilLock % 60 })
    : '';
</script>

<Modal
  open={$timeUntilLock !== null}
  size="small"
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <div class="text-center">
    <Icon icon={faHourglassHalf} class="mb-2 text-4xl text-warning-fg" />
    <h3 class="m-0 mb-3 text-xl text-warning-fg">{$t('auth.sessionTimeout.title')}</h3>
    <p class="mb-6 text-base leading-normal text-muted">
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
