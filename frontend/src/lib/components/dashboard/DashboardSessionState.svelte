<script lang="ts">
  import { t } from "$lib/i18n";
  import { faLock } from "@fortawesome/free-solid-svg-icons";
  import { Button, Card, EmptyState, Spinner } from "$lib/components/ui";

  interface Props {
    mode: 'loading' | 'locked';
  }

  let { mode }: Props = $props();
</script>

{#if mode === 'loading'}
  <Card class="flex items-center justify-center gap-3 py-16 text-muted">
    <Spinner />
    <p class="m-0">{$t("dashboard.sessionState.initializing")}</p>
  </Card>
{:else}
  <Card>
    <EmptyState
      icon={faLock}
      title={$t("dashboard.sessionState.lockedTitle")}
      description={$t("dashboard.sessionState.lockedText")}
    >
      {#snippet actions()}
        <Button href="/unlock">{$t("dashboard.sessionState.unlockButton")}</Button>
      {/snippet}
    </EmptyState>
  </Card>
{/if}
