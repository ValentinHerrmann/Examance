<script lang="ts">
  import './DashboardSessionState.css';

  export let mode: 'loading' | 'locked';
</script>

{#if mode === 'loading'}
  <div class="loading-state">
    <p>Initializing local session...</p>
  </div>
{:else}
  <div class="dashboard-session-state-locked-state">
    <h2>Session Locked</h2>
    <p>Please unlock your session to access projects.</p>
    <a href="/unlock" class="dashboard-session-state-unlock-link">Unlock Session</a>
  </div>
{/if}
