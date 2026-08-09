<script lang="ts">
  import "./AnalyticsStateBanner.css";
  export let variant: 'loading' | 'locked';
</script>

{#if variant === 'loading'}
  <div class="asb-loading-state">
    <p>Loading analytics data across all exams...</p>
  </div>
{:else}
  <div class="asb-locked-state">
    <h2>Session Locked</h2>
    <p>Please unlock your session to access global analytics.</p>
    <a href="/unlock" class="asb-unlock-link">Unlock Session</a>
  </div>
{/if}
