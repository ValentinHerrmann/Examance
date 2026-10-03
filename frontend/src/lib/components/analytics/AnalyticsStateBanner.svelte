<script lang="ts">
  import { t } from '$lib/i18n';
  import { faLock } from '@fortawesome/free-solid-svg-icons';
  import { Button, Card, EmptyState, Spinner } from '$lib/components/ui';

  interface Props {
    variant: 'loading' | 'locked';
  }

  let { variant }: Props = $props();
</script>

{#if variant === 'loading'}
  <Card class="flex items-center justify-center gap-3 py-16 text-muted">
    <Spinner />
    <p class="m-0">{$t('stats.analyticsBanner.loading')}</p>
  </Card>
{:else}
  <Card>
    <EmptyState icon={faLock} title={$t('stats.analyticsBanner.lockedTitle')} description={$t('stats.analyticsBanner.lockedBody')}>
      {#snippet actions()}
        <Button href="/unlock">{$t('stats.analyticsBanner.unlockLink')}</Button>
      {/snippet}
    </EmptyState>
  </Card>
{/if}
