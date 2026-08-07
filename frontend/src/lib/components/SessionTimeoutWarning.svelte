<script lang="ts">
  import './SessionTimeoutWarning.css';
  import { timeUntilLock, keepSessionAlive } from '$lib/db/hygiene';

  $: formattedTime = $timeUntilLock !== null
    ? `${Math.floor($timeUntilLock / 60)}m ${$timeUntilLock % 60}s`
    : '';
</script>

{#if $timeUntilLock !== null}
  <div class="session-timeout-warning-overlay">
    <div class="session-timeout-warning-modal">
      <div class="session-timeout-warning-icon">⏳</div>
      <h3>Session Timeout Warning</h3>
      <p>
        Your session will lock in <strong>{formattedTime}</strong> due to inactivity to protect sensitive data.
      </p>
      <div class="session-timeout-warning-modal-actions">
        <button class="session-timeout-warning-keep-alive-btn" on:click={keepSessionAlive}>
          Keep Session Alive
        </button>
      </div>
    </div>
  </div>
{/if}
