<script lang="ts">
  /**
   * The gated storage-mode switch: explain → export → wipe & switch → import.
   * Export and import reuse the app's own interactive archive flows; conflicts
   * are answered by the dialog mounted in the root layout.
   */
  import { get } from 'svelte/store';
  import { t, translate } from '$lib/i18n';
  import { Modal, Button } from '$lib/components/ui';
  import { isAuthenticated } from '$lib/stores/session';
  import { getStoragePolicyBadge, type StorageMode } from '$lib/stores/storagePolicy';
  import {
    abortModeSwitch,
    beginModeSwitch,
    commitModeSwitch,
    finishModeSwitch,
    localWorkspaceIsEmpty,
    markExported,
    pendingSwitchStore,
    requireExport,
  } from '$lib/services/storageModeSwitch';
  import {
    exportArchiveInteractively,
    importArchiveInteractively,
  } from '$lib/services/archiveService';

  export let open = false;
  /** The mode to switch to; null when resuming an interrupted switch. */
  export let target: StorageMode | null = null;
  export let onClose: () => void;

  const STEPS = [
    { phase: 'confirm', label: 'storagePolicy.switch.stepExplain' },
    { phase: 'export', label: 'storagePolicy.switch.stepExport' },
    { phase: 'exported', label: 'storagePolicy.switch.stepSwitch' },
    { phase: 'reimport', label: 'storagePolicy.switch.stepImport' },
  ] as const;

  let understood = false;
  let busy = false;
  let errorMsg = '';
  let workspaceEmpty = false;

  $: pending = $pendingSwitchStore;
  $: phase = pending?.phase === 'switching' ? 'exported' : pending?.phase;
  $: toLabel = pending ? modeLabel(pending.to) : '';
  $: if (open && target && !pending) void start(target);

  function modeLabel(mode: StorageMode): string {
    return getStoragePolicyBadge({ storageMode: mode, latexCompilation: 'local' }).text;
  }

  async function start(to: StorageMode) {
    if (to !== 'all-local' && !get(isAuthenticated)) {
      errorMsg = translate('storagePolicy.switch.needsAuth');
      return;
    }
    beginModeSwitch(to);
    workspaceEmpty = await localWorkspaceIsEmpty();
  }

  async function run(action: () => Promise<unknown>) {
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
    onClose();
  }

  function handleCancel() {
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
      finishModeSwitch();
      close();
    }
  }

  function handleImportLater() {
    finishModeSwitch();
    close();
  }
</script>

<Modal
  {open}
  size="lg"
  title={$t('storagePolicy.switch.title')}
  closeOnBackdrop={false}
  closeOnEscape={!busy}
  onClose={handleCancel}
>
  {#if pending}
    <ol class="mb-4 flex flex-wrap gap-2 text-xs text-subtle">
      {#each STEPS as step, i (step.phase)}
        <li class="rounded-full px-2 py-1 {phase === step.phase ? 'bg-accent-strong text-content' : 'bg-surface-sunken'}">
          {i + 1}. {$t(step.label)}
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
        <p class="text-subtle">{$t('storagePolicy.switch.serverKeptNote')}</p>
        <label class="flex items-start gap-2 pt-2 text-content">
          <input type="checkbox" bind:checked={understood} class="mt-1" />
          <span>{$t('storagePolicy.switch.understandCheckbox')}</span>
        </label>
      {:else if phase === 'export'}
        <h4 class="font-semibold text-content">{$t('storagePolicy.switch.exportHeading')}</h4>
        <p>{$t('storagePolicy.switch.exportBody')}</p>
        <p class="text-subtle">{$t('storagePolicy.switch.exportRequired')}</p>
      {:else if phase === 'exported'}
        <h4 class="font-semibold text-content">{$t('storagePolicy.switch.wipeHeading')}</h4>
        <p class="text-amber-300">{$t('storagePolicy.switch.wipeWarning', { to: toLabel })}</p>
        {#if pending.archiveFilename}
          <p class="text-xs text-subtle">
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
          on:change={(e) => run(() => handleImport(e))}
          class="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-inset
                 file:px-3 file:py-1.5 file:text-content"
        />
      {/if}
    </div>
  {/if}

  {#if errorMsg}
    <p class="mt-3 whitespace-pre-wrap text-sm text-red-400">{errorMsg}</p>
  {/if}

  <svelte:fragment slot="footer">
    {#if phase === 'reimport'}
      <Button variant="secondary" disabled={busy} onClick={handleImportLater}>
        {$t('storagePolicy.switch.importSkip')}
      </Button>
    {:else if pending}
      <Button variant="secondary" disabled={busy} onClick={handleCancel}>
        {$t('storagePolicy.switch.cancel')}
      </Button>
      {#if phase === 'confirm'}
        <Button variant="primary" disabled={!understood} onClick={requireExport}>
          {$t('storagePolicy.switch.stepExport')}
        </Button>
      {:else if phase === 'export'}
        <Button variant="ghost" disabled={busy} onClick={() => markExported()}>
          {$t(workspaceEmpty ? 'storagePolicy.switch.skipExportEmpty' : 'storagePolicy.switch.skipExportHaveArchive')}
        </Button>
        <Button variant="primary" loading={busy} onClick={() => run(handleExport)}>
          {$t('storagePolicy.switch.exportButton')}
        </Button>
      {:else if phase === 'exported'}
        <Button variant="danger" loading={busy} onClick={() => run(commitModeSwitch)}>
          {$t('storagePolicy.switch.wipeButton')}
        </Button>
      {/if}
    {/if}
  </svelte:fragment>
</Modal>
