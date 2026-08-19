<script lang="ts">
  import "./AnalyticsStateBanner.css";
  import { t } from '$lib/i18n';
  export let variant: 'loading' | 'locked';
</script>

{#if variant === 'loading'}
  <div class="asb-loading-state">
    <p>{$t('stats.analyticsBanner.loading')}</p>
  </div>
{:else}
  <div class="asb-locked-state">
    <h2>{$t('stats.analyticsBanner.lockedTitle')}</h2>
    <p>{$t('stats.analyticsBanner.lockedBody')}</p>
    <a href="/unlock" class="asb-unlock-link">{$t('stats.analyticsBanner.unlockLink')}</a>
  </div>
{/if}
