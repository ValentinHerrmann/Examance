<script lang="ts">
  import { timeUntilLock, keepSessionAlive } from '$lib/db/hygiene';
  import { t } from '$lib/i18n';

  $: formattedTime = $timeUntilLock !== null
    ? $t('auth.sessionTimeout.minutesSeconds', { minutes: Math.floor($timeUntilLock / 60), seconds: $timeUntilLock % 60 })
    : '';
</script>

{#if $timeUntilLock !== null}
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/85 backdrop-blur-sm">
    <div class="w-[90%] max-w-[420px] rounded-xl border border-yellow-500 bg-slate-800 p-8 text-center text-slate-50 shadow-2xl">
      <div class="mb-2 text-[2.5rem]">⏳</div>
      <h3 class="m-0 mb-3 text-[1.35rem] text-yellow-200">{$t('auth.sessionTimeout.title')}</h3>
      <p class="mb-6 text-[0.95rem] leading-normal text-slate-300">
        {$t('auth.sessionTimeout.messageBefore')}
        <strong>{formattedTime}</strong>
        {$t('auth.sessionTimeout.messageAfter')}
      </p>
      <div class="flex justify-center">
        <button class="rounded-md border-none bg-sky-600 px-6 py-3 text-base font-semibold text-white transition-colors duration-150 hover:bg-sky-700" on:click={keepSessionAlive}>
          {$t('auth.sessionTimeout.keepAlive')}
        </button>
      </div>
    </div>
  </div>
{/if}
