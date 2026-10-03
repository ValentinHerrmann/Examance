<script lang="ts">
  // The gated storage-mode switch: explain → export → wipe & switch → import.
  // Conflicts during import are answered by the dialog mounted in the root layout.
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { t, translate } from '$lib/i18n';
  import { Alert, Badge, Button, Checkbox, Modal } from '$lib/components/ui';
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
    beginModeSwitch(to);
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

  $effect.pre(() => {
    const isOpen = open;
    const to = target;
    const p = pending;
    if (isOpen && to && !p) untrack(() => void start(to));
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
  {#if pending}
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
    {#if phase === 'reimport'}
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
