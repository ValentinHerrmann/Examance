<script lang="ts">
  // The gated storage-mode switch: explain → export → wipe & switch → import.
  // Conflicts during import are answered by the dialog mounted in the root layout.
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { t, translate } from '#lib/i18n';
  import { Alert, Badge, Button, Checkbox, Modal } from '#lib/components/ui';
  import { isAuthenticated } from '#lib/stores/session';
  import { getStoragePolicyBadge, type StorageMode } from '#lib/stores/storagePolicy';
  import {
    abortModeSwitch,
    beginModeSwitch,
    commitModeSwitch,
    finishModeSwitch,
    localWorkspaceIsEmpty,
    markExported,
    pendingSwitchStore,
    PendingWritesError,
    purgeServerStudentData,
    requireExport,
    switchLeavesServerStudentData,
  } from '#lib/services/storageModeSwitch';
  import { flushOfflineQueue, pendingWritesCount } from '#lib/services/offlineQueue';
  import {
    exportArchiveInteractively,
    importArchiveInteractively,
  } from '#lib/services/archiveService';

  interface Props {
    open?: boolean;
    /** The mode to switch to; null when resuming an interrupted switch. */
    target?: StorageMode | null;
    onClose: () => void;
  }

  let { open = false, target = null, onClose }: Props = $props();

  const STEPS = [
    { phase: 'confirm', label: 'storagePolicy.switch.stepExplain' },
    { phase: 'export', label: 'storagePolicy.switch.stepExport' },
    { phase: 'exported', label: 'storagePolicy.switch.stepSwitch' },
    { phase: 'reimport', label: 'storagePolicy.switch.stepImport' },
  ] as const;

  let understood = $state(false);
  let busy = $state(false);
  let errorMsg = $state('');
  let workspaceEmpty = $state(false);
  // Set when a switch was refused over writes still waiting for the server.
  let blockedByPendingWrites = $state(false);
  // After a verified import that took student data off the server: offer deleting the server copy.
  let purgeOffer: { from: StorageMode; to: StorageMode } | null = $state.raw(null);
  let purgeStudents = $state(true);
  let purgeResult = $state('');

  let pending = $derived($pendingSwitchStore);
  let phase = $derived(pending?.phase === 'switching' ? 'exported' : pending?.phase);
  let toLabel = $derived(pending ? modeLabel(pending.to) : '');

  function modeLabel(mode: StorageMode): string {
    return getStoragePolicyBadge({ storageMode: mode, latexCompilation: 'local' }).text;
  }

  async function start(to: StorageMode) {
    if (to !== 'all-local' && !get(isAuthenticated)) {
      errorMsg = translate('storagePolicy.switch.needsAuth');
      return;
    }
    try {
      beginModeSwitch(to);
    } catch (err) {
      if (err instanceof PendingWritesError) {
        blockedByPendingWrites = true;
        return;
      }
      throw err;
    }
    blockedByPendingWrites = false;
    workspaceEmpty = await localWorkspaceIsEmpty();
  }

  async function runAction(action: () => Promise<unknown>) {
    busy = true;
    errorMsg = '';
    try {
      await action();
    } catch (err: any) {
      errorMsg = err.message;
    } finally {
      busy = false;
    }
  }

  function close() {
    understood = false;
    errorMsg = '';
    blockedByPendingWrites = false;
    purgeOffer = null;
    purgeResult = '';
    onClose();
  }

  async function handleSyncNow() {
    await flushOfflineQueue();
    if (get(pendingWritesCount) > 0) {
      errorMsg = translate('storagePolicy.switch.pendingWritesStill');
      return;
    }
    // The effect below restarts the switch once the flag drops.
    blockedByPendingWrites = false;
  }

  async function handlePurge() {
    const res = await purgeServerStudentData();
    purgeResult = translate('storagePolicy.switch.purgeDone', {
      students: res.students,
      submissions: res.submissions,
    });
    purgeOffer = null;
  }

  function handleCancel() {
    if (!pending) {
      close();
      return;
    }
    if (abortModeSwitch()) close();
    else errorMsg = translate('storagePolicy.switch.cannotAbortAfterWipe');
  }

  async function handleExport() {
    const filename = `examance-${new Date().toISOString().slice(0, 10)}.bgproj`;
    if (await exportArchiveInteractively(filename)) markExported(filename);
  }

  async function handleImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file && (await importArchiveInteractively(file))) {
      const done = get(pendingSwitchStore);
      finishModeSwitch();
      // Only after a verified import: the archive's data now lives in the new mode.
      if (done && switchLeavesServerStudentData(done.from, done.to) && get(isAuthenticated)) {
        purgeOffer = { from: done.from, to: done.to };
      } else {
        close();
      }
    }
  }

  function handleImportLater() {
    finishModeSwitch();
    close();
  }

  $effect.pre(() => {
    const isOpen = open;
    const to = target;
    const p = pending;
    if (isOpen && to && !p && !blockedByPendingWrites) untrack(() => void runAction(() => start(to)));
  });
</script>

<Modal
  {open}
  size="medium"
  title={$t('storagePolicy.switch.title')}
  closeOnBackdrop={false}
  closeOnEscape={!busy}
  onClose={handleCancel}
>
  {#if blockedByPendingWrites}
    <div class="space-y-2 text-sm text-muted">
      <h4 class="font-semibold text-content">{$t('storagePolicy.switch.pendingWritesHeading')}</h4>
      <p>{$t('storagePolicy.switch.pendingWritesBody', { count: $pendingWritesCount })}</p>
    </div>
  {:else if purgeOffer || purgeResult}
    <div class="space-y-2 text-sm text-muted">
      <h4 class="font-semibold text-content">{$t('storagePolicy.switch.purgeHeading')}</h4>
      {#if purgeResult}
        <p>{purgeResult}</p>
      {:else}
        <p>{$t('storagePolicy.switch.purgeBody')}</p>
        <Checkbox bind:checked={purgeStudents} label={$t('storagePolicy.switch.purgeStudents')} class="pt-2" />
        <p class="text-xs">{$t('storagePolicy.switch.purgeGrace')}</p>
      {/if}
    </div>
  {:else if pending}
    <ol class="mb-4 flex flex-wrap gap-2 text-xs text-muted">
      {#each STEPS as step, i (step.phase)}
        <li>
          <Badge severity={phase === step.phase ? 'primary' : 'secondary'}>{i + 1}. {$t(step.label)}</Badge>
        </li>
      {/each}
    </ol>

    <div class="space-y-2 text-sm text-muted">
      {#if phase === 'confirm'}
        <h4 class="font-semibold text-content">
          {$t('storagePolicy.switch.introHeading', { from: modeLabel(pending.from), to: toLabel })}
        </h4>
        <p>{$t('storagePolicy.switch.introBody')}</p>
        <p>{$t('storagePolicy.switch.bridgeNote')}</p>
        <p class="text-muted">{$t('storagePolicy.switch.serverKeptNote')}</p>
        <p class="text-muted">{$t('storagePolicy.switch.otherTabsNote')}</p>
        <Checkbox bind:checked={understood} label={$t('storagePolicy.switch.understandCheckbox')} class="pt-2" />
      {:else if phase === 'export'}
        <h4 class="font-semibold text-content">{$t('storagePolicy.switch.exportHeading')}</h4>
        <p>{$t('storagePolicy.switch.exportBody')}</p>
        <p class="text-muted">{$t('storagePolicy.switch.exportRequired')}</p>
      {:else if phase === 'exported'}
        <h4 class="font-semibold text-content">{$t('storagePolicy.switch.wipeHeading')}</h4>
        <p class="text-warning-fg">{$t('storagePolicy.switch.wipeWarning', { to: toLabel })}</p>
        {#if pending.archiveFilename}
          <p class="text-xs text-muted">
            {$t('storagePolicy.switch.exportDone', { filename: pending.archiveFilename })}
          </p>
        {/if}
      {:else if phase === 'reimport'}
        <h4 class="font-semibold text-content">{$t('storagePolicy.switch.importHeading')}</h4>
        <p>{$t('storagePolicy.switch.importBody')}</p>
        <input
          type="file"
          accept=".bgproj"
          disabled={busy}
          onchange={(e) => runAction(() => handleImport(e))}
          class="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-inset
                 file:px-3 file:py-1.5 file:text-content"
        />
      {/if}
    </div>
  {/if}

  {#if errorMsg}
    <Alert severity="danger" class="mt-3 whitespace-pre-wrap">{errorMsg}</Alert>
  {/if}

  {#snippet footer()}
    {#if blockedByPendingWrites}
      <Button variant="outlined" severity="secondary" disabled={busy} onClick={close}>
        {$t('storagePolicy.switch.cancel')}
      </Button>
      <Button loading={busy} onClick={() => runAction(handleSyncNow)}>
        {$t('storagePolicy.switch.pendingWritesSync')}
      </Button>
    {:else if purgeResult}
      <Button onClick={close}>{$t('storagePolicy.switch.purgeClose')}</Button>
    {:else if purgeOffer}
      <Button variant="outlined" severity="secondary" disabled={busy} onClick={close}>
        {$t('storagePolicy.switch.purgeKeep')}
      </Button>
      <Button severity="danger" loading={busy} disabled={!purgeStudents} onClick={() => runAction(handlePurge)}>
        {$t('storagePolicy.switch.purgeButton')}
      </Button>
    {:else if phase === 'reimport'}
      <Button variant="outlined" severity="secondary" disabled={busy} onClick={handleImportLater}>
        {$t('storagePolicy.switch.importSkip')}
      </Button>
    {:else if pending}
      <Button variant="outlined" severity="secondary" disabled={busy} onClick={handleCancel}>
        {$t('storagePolicy.switch.cancel')}
      </Button>
      {#if phase === 'confirm'}
        <Button disabled={!understood} onClick={requireExport}>
          {$t('storagePolicy.switch.stepExport')}
        </Button>
      {:else if phase === 'export'}
        <Button variant="text" severity="secondary" disabled={busy} onClick={() => markExported()}>
          {$t(workspaceEmpty ? 'storagePolicy.switch.skipExportEmpty' : 'storagePolicy.switch.skipExportHaveArchive')}
        </Button>
        <Button loading={busy} onClick={() => runAction(handleExport)}>
          {$t('storagePolicy.switch.exportButton')}
        </Button>
      {:else if phase === 'exported'}
        <Button severity="danger" loading={busy} onClick={() => runAction(commitModeSwitch)}>
          {$t('storagePolicy.switch.wipeButton')}
        </Button>
      {/if}
    {/if}
  {/snippet}
</Modal>
