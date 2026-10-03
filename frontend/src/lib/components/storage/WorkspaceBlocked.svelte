<script lang="ts">
  // Shown instead of every route while the unlocked session does not own this browser's workspace
  // (lib/db/workspace.ts, owner binding). Nothing is read or written until the person decides.
  import { t } from '#lib/i18n';
  import { Alert, Button, Checkbox, PageShell } from '#lib/components/ui';
  import { lockSession } from '#lib/db/hygiene';
  import { resetWorkspaceForCurrentSession } from '#lib/db/workspace';
  import type { WorkspaceBlockReason } from '#lib/stores/workspaceState';

  interface Props {
    reason: WorkspaceBlockReason;
  }

  let { reason }: Props = $props();

  // Literal keys per reason, so a missing translation is a type error.
  const COPY = {
    'foreign-key': {
      title: 'storagePolicy.workspace.blocked.foreignKey.title',
      body: 'storagePolicy.workspace.blocked.foreignKey.body',
      primary: 'storagePolicy.workspace.blocked.foreignKey.primary',
      reset: 'storagePolicy.workspace.blocked.foreignKey.reset',
    },
    'foreign-account': {
      title: 'storagePolicy.workspace.blocked.foreignAccount.title',
      body: 'storagePolicy.workspace.blocked.foreignAccount.body',
      primary: 'storagePolicy.workspace.blocked.foreignAccount.primary',
      reset: 'storagePolicy.workspace.blocked.foreignAccount.reset',
    },
    'needs-sign-in': {
      title: 'storagePolicy.workspace.blocked.needsSignIn.title',
      body: 'storagePolicy.workspace.blocked.needsSignIn.body',
      primary: 'storagePolicy.workspace.blocked.needsSignIn.primary',
      reset: 'storagePolicy.workspace.blocked.needsSignIn.reset',
    },
    'pending-writes': {
      title: 'storagePolicy.workspace.blocked.pendingWrites.title',
      body: 'storagePolicy.workspace.blocked.pendingWrites.body',
      primary: 'storagePolicy.workspace.blocked.pendingWrites.primary',
      reset: 'storagePolicy.workspace.blocked.pendingWrites.reset',
    },
  } as const;

  let copy = $derived(COPY[reason]);

  let confirmed = $state(false);
  let busy = $state(false);
  let errorMsg = $state('');

  async function handleReset() {
    busy = true;
    errorMsg = '';
    try {
      await resetWorkspaceForCurrentSession();
      window.location.href = '/';
    } catch (err: any) {
      errorMsg = err?.message ?? String(err);
    } finally {
      busy = false;
    }
  }
</script>

<PageShell width="narrow" center>
  <div class="space-y-4 rounded-xl border border-line bg-surface-raised p-6">
    <h1 class="text-lg font-semibold text-content">{$t(copy.title)}</h1>
    <p class="text-sm text-muted">{$t(copy.body)}</p>

    <div class="flex flex-wrap gap-2">
      <Button onClick={lockSession}>
        {$t(copy.primary)}
      </Button>
    </div>

    <div class="space-y-2 border-t border-line pt-4">
      <p class="text-sm text-warning-fg">{$t(copy.reset)}</p>
      <Checkbox bind:checked={confirmed} label={$t('storagePolicy.workspace.blocked.resetConfirm')} />
      <Button severity="danger" variant="outlined" disabled={!confirmed} loading={busy} onClick={handleReset}>
        {$t('storagePolicy.workspace.blocked.resetButton')}
      </Button>
    </div>

    {#if errorMsg}
      <Alert severity="danger" class="whitespace-pre-wrap">{errorMsg}</Alert>
    {/if}
  </div>
</PageShell>
