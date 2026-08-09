<script lang="ts">
  import { timeUntilLock, keepSessionAlive } from '$lib/db/hygiene';

  $: formattedTime = $timeUntilLock !== null
    ? `${Math.floor($timeUntilLock / 60)}m ${$timeUntilLock % 60}s`
    : '';
</script>

{#if $timeUntilLock !== null}
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/85 backdrop-blur-sm">
    <div class="w-[90%] max-w-[420px] rounded-xl border border-yellow-500 bg-slate-800 p-8 text-center text-slate-50 shadow-2xl">
      <div class="mb-2 text-[2.5rem]">⏳</div>
      <h3 class="m-0 mb-3 text-[1.35rem] text-yellow-200">Session Timeout Warning</h3>
      <p class="mb-6 text-[0.95rem] leading-normal text-slate-300">
        Your session will lock in <strong>{formattedTime}</strong> due to inactivity to protect sensitive data.
      </p>
      <div class="flex justify-center">
        <button class="rounded-md border-none bg-sky-600 px-6 py-3 text-base font-semibold text-white transition-colors duration-150 hover:bg-sky-700" on:click={keepSessionAlive}>
          Keep Session Alive
        </button>
      </div>
    </div>
  </div>
{/if}
