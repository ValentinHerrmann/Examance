<script lang="ts">
  // Shown instead of the app while the unlocked session does not own this browser's workspace
  // (lib/db/workspace.ts, owner binding). Nothing is read or written until the person decides. It names
  // whose workspace this is and offers the way back in, plus a confirmed reset as the last resort.
  import { onMount } from 'svelte';
  import { t } from '#lib/i18n';
  import { Alert, Button, Checkbox } from '#lib/components/ui';
  import { lockSession } from '#lib/db/hygiene';
  import { describeWorkspace, resetWorkspaceForCurrentSession, type WorkspaceSummary } from '#lib/db/workspace';
  import { extractHostname } from '#lib/stores/backendStore';
  import type { WorkspaceBlockReason } from '#lib/stores/workspaceState';

  interface Props {
    reason: WorkspaceBlockReason;
  }

  let { reason }: Props = $props();

  // Literal keys per case, so a missing translation is a type error.
  const COPY = {
    passphraseOwned: {
      title: 'storagePolicy.workspace.blocked.passphraseOwned.title',
      body: 'storagePolicy.workspace.blocked.passphraseOwned.body',
      primary: 'storagePolicy.workspace.blocked.passphraseOwned.primary',
      reset: 'storagePolicy.workspace.blocked.passphraseOwned.reset',
      resetButton: 'storagePolicy.workspace.blocked.passphraseOwned.resetButton',
    },
    accountOwned: {
      title: 'storagePolicy.workspace.blocked.accountOwned.title',
      body: 'storagePolicy.workspace.blocked.accountOwned.body',
      primary: 'storagePolicy.workspace.blocked.accountOwned.primary',
      reset: 'storagePolicy.workspace.blocked.accountOwned.reset',
      resetButton: 'storagePolicy.workspace.blocked.accountOwned.resetButton',
    },
    unknownOwner: {
      title: 'storagePolicy.workspace.blocked.unknownOwner.title',
      body: 'storagePolicy.workspace.blocked.unknownOwner.body',
      primary: 'storagePolicy.workspace.blocked.unknownOwner.primary',
      reset: 'storagePolicy.workspace.blocked.unknownOwner.reset',
      resetButton: 'storagePolicy.workspace.blocked.unknownOwner.resetButton',
    },
    needsSignIn: {
      title: 'storagePolicy.workspace.blocked.needsSignIn.title',
      body: 'storagePolicy.workspace.blocked.needsSignIn.body',
      primary: 'storagePolicy.workspace.blocked.needsSignIn.primary',
      reset: 'storagePolicy.workspace.blocked.needsSignIn.reset',
      resetButton: 'storagePolicy.workspace.blocked.needsSignIn.resetButton',
    },
    pendingWrites: {
      title: 'storagePolicy.workspace.blocked.pendingWrites.title',
      body: 'storagePolicy.workspace.blocked.pendingWrites.body',
      primary: 'storagePolicy.workspace.blocked.pendingWrites.primary',
      reset: 'storagePolicy.workspace.blocked.pendingWrites.reset',
      resetButton: 'storagePolicy.workspace.blocked.pendingWrites.resetButton',
    },
  } as const;

  let summary = $state.raw<WorkspaceSummary | null>(null);
  let confirmed = $state(false);
  let busy = $state(false);
  let errorMsg = $state('');

  let variant = $derived.by((): keyof typeof COPY => {
    if (reason === 'needs-sign-in') return 'needsSignIn';
    if (reason === 'pending-writes') return 'pendingWrites';
    if (reason === 'foreign-account') return 'accountOwned';
    if (summary?.ownerKind === 'local-vault') return 'passphraseOwned';
    if (summary?.ownerKind === 'account') return 'accountOwned';
    return 'unknownOwner';
  });
  let copy = $derived(COPY[variant]);
  let owner = $derived(
    summary?.accountEmail
      ? summary.backendOrigin
        ? `${summary.accountEmail} (${extractHostname(summary.backendOrigin)})`
        : summary.accountEmail
      : (summary?.backendOrigin ? extractHostname(summary.backendOrigin) : '?'),
  );
  // Hybrid keeps student data only in this browser; starting over loses it for good.
  let losesLocalResults = $derived(summary?.mode === 'hybrid' && summary.hasData);

  onMount(async () => {
    summary = await describeWorkspace();
  });

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

<div class="mx-auto w-full max-w-form space-y-4 rounded-xl border border-line bg-surface-raised p-6">
    <h1 class="m-0 text-lg font-semibold text-content">{$t(copy.title, { owner })}</h1>
    <p class="m-0 text-sm text-muted">{$t(copy.body, { owner })}</p>

    <Button onClick={lockSession}>{$t(copy.primary, { owner })}</Button>

    <div class="space-y-2 border-t border-line pt-4">
      <p class="m-0 text-sm text-muted">{$t(copy.reset, { owner })}</p>
      {#if losesLocalResults}
        <p class="m-0 text-sm text-warning-fg">{$t('storagePolicy.workspace.blocked.hybridLoss')}</p>
      {/if}
      <Checkbox bind:checked={confirmed} label={$t('storagePolicy.workspace.blocked.resetConfirm')} />
      <Button severity="danger" variant="outlined" disabled={!confirmed} loading={busy} onClick={handleReset}>
        {$t(copy.resetButton)}
      </Button>
    </div>

    {#if errorMsg}
      <Alert severity="danger" class="whitespace-pre-wrap">{errorMsg}</Alert>
    {/if}
</div>
