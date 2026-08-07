<script lang="ts">
  export let mode: 'loading' | 'locked';
</script>

{#if mode === 'loading'}
  <div class="loading-state">
    <p>Initializing local session...</p>
  </div>
{:else}
  <div class="locked-state">
    <h2>Session Locked</h2>
    <p>Please unlock your session to access projects.</p>
    <a href="/unlock" class="unlock-link">Unlock Session</a>
  </div>
{/if}

<style>
  .locked-state {
    text-align: center;
    padding: 4rem 2rem;
    background: #1e293b;
    border-radius: 12px;
    border: 1px dashed #334155;
  }

  h2 {
    margin: 0;
    font-size: 1.75rem;
    color: #f8fafc;
  }

  .unlock-link {
    padding: 0.625rem 1.25rem;
    background: #0284c7;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
  }

  .unlock-link:hover {
    background: #0369a1;
  }
</style>
