<script lang="ts">
  export let variant: 'loading' | 'locked';
</script>

{#if variant === 'loading'}
  <div class="loading-state">
    <p>Loading analytics data across all exams...</p>
  </div>
{:else}
  <div class="locked-state">
    <h2>Session Locked</h2>
    <p>Please unlock your session to access global analytics.</p>
    <a href="/unlock" class="unlock-link">Unlock Session</a>
  </div>
{/if}

<style>
  .loading-state,
  .locked-state {
    text-align: center;
    padding: 4rem 2rem;
    background: #1e293b;
    border-radius: 12px;
    border: 1px dashed #334155;
  }

  .unlock-link {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.625rem 1.25rem;
    background: #0284c7;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
  }
</style>
