<script lang="ts">
  /**
   * The gated storage-mode switch.
   *
   * The handler this replaces was `confirm()` → `wipeDatabase()` →
   * `updateSetting` → reload. It destroyed every local exam, exercise,
   * submission, scan, score and MC group without uploading any of it, and
   * nothing checked whether the destination already held equivalent data.
   *
   * The archive is the only bridge between storage locations, so the export is
   * a step of the switch rather than something to remember beforehand.
   */
  import { get } from 'svelte/store';
  import { t, translate } from '$lib/i18n';
  import { Modal, Button, Field, TextInput } from '$lib/components/ui';
  import { isAuthenticated, sessionStore } from '$lib/stores/session';
  import type { StorageMode } from '$lib/stores/storagePolicy';
  import { getStoragePolicyBadge } from '$lib/stores/storagePolicy';
  import {
    abortModeSwitch,
    beginModeSwitch,
    commitModeSwitch,
    finishModeSwitch,
    localWorkspaceIsEmpty,
    markExportSkipped,
    markExported,
    pendingSwitchStore,
    requireExport,
  } from '$lib/services/storageModeSwitch';
  import { exportBgprojArchive, openBgprojArchive } from '$lib/services/archiveService';
  import ImportConflictModal from './ImportConflictModal.svelte';
  import type { ArchiveConflict, DecisionMap } from '$lib/archive/conflicts';

  export let open = false;
  export let target: StorageMode | null = null;
  export let onClose: () => void;

  /**
   * The step rail. Keys are listed literally rather than composed, so a typo is
   * a `svelte-check` error — `$t` only accepts a `TranslationKey`.
   */
  const STEPS = [
    { phase: 'confirm', labelKey: 'storagePolicy.switch.stepExplain' },
    { phase: 'export', labelKey: 'storagePolicy.switch.stepExport' },
    { phase: 'switching', labelKey: 'storagePolicy.switch.stepSwitch' },
    { phase: 'reimport', labelKey: 'storagePolicy.switch.stepImport' },
  ] as const;

  let exportPassword = '';
  let importPassword = '';
  let importFile: File | null = null;
  let understood = false;
  let busy = false;
  let statusMsg = '';
  let errorMsg = '';
  let workspaceEmpty = false;

  let conflictsOpen = false;
  let pendingConflicts: ArchiveConflict[] = [];
  let pendingIdenticalCount = 0;
  let resolveConflicts: ((decisions: DecisionMap) => void) | null = null;
  let rejectConflicts: ((reason: Error) => void) | null = null;

  $: pending = $pendingSwitchStore;
  $: phase = pending?.phase ?? 'idle';

  const modeLabel = (mode: StorageMode | null | undefined) =>
    mode ? getStoragePolicyBadge({ storageMode: mode, latexCompilation: 'local' }).text : '';

  $: if (open && target && !pending) {
    void startSwitch(target);
  }

  async function startSwitch(to: StorageMode) {
    errorMsg = '';
    if ((to === 'all-server' || to === 'hybrid') && !get(isAuthenticated)) {
      errorMsg = translate('storagePolicy.switch.needsAuth');
      return;
    }
    beginModeSwitch(to);
    workspaceEmpty = await localWorkspaceIsEmpty();
  }

  function handleCancel() {
    if (!abortModeSwitch()) {
      errorMsg = translate('storagePolicy.switch.cannotAbortAfterWipe');
      return;
    }
    reset();
    onClose();
  }

  function reset() {
    exportPassword = '';
    importPassword = '';
    importFile = null;
    understood = false;
    statusMsg = '';
    errorMsg = '';
  }

  async function handleExport() {
    if (!exportPassword) return;
    busy = true;
    errorMsg = '';
    statusMsg = translate('storagePolicy.switch.exportRunning');
    try {
      const filename = `examance-${new Date().toISOString().slice(0, 10)}.bgproj`;
      await exportBgprojArchive(exportPassword, filename);
      markExported(filename);
      statusMsg = translate('storagePolicy.switch.exportDone', { filename });
      exportPassword = '';
    } catch (err: any) {
      errorMsg = translate('storagePolicy.switch.exportFailed', { message: err.message });
      statusMsg = '';
    } finally {
      busy = false;
    }
  }

  async function handleCommit() {
    busy = true;
    errorMsg = '';
    statusMsg = translate('storagePolicy.switch.switching');
    try {
      await commitModeSwitch();
      statusMsg = '';
    } catch (err: any) {
      errorMsg = err.message;
    } finally {
      busy = false;
    }
  }

  /**
   * Handed to the import as its conflict resolver. Returns a promise the modal
   * settles, so the import genuinely waits for the teacher rather than
   * proceeding on a default.
   */
  function askAboutConflicts(
    conflicts: ArchiveConflict[],
    identicalCount: number
  ): Promise<DecisionMap> {
    pendingConflicts = conflicts;
    pendingIdenticalCount = identicalCount;
    conflictsOpen = true;
    return new Promise<DecisionMap>((resolve, reject) => {
      resolveConflicts = resolve;
      rejectConflicts = reject;
    });
  }

  function handleConflictsConfirmed(decisions: DecisionMap) {
    conflictsOpen = false;
    resolveConflicts?.(decisions);
    resolveConflicts = null;
    rejectConflicts = null;
  }

  function handleConflictsCancelled() {
    conflictsOpen = false;
    rejectConflicts?.(new Error(translate('workspace.archive.importCancelled')));
    resolveConflicts = null;
    rejectConflicts = null;
  }

  async function handleImport() {
    if (!importFile || !importPassword) return;
    busy = true;
    errorMsg = '';
    statusMsg = translate('storagePolicy.switch.importRunning');
    try {
      const result = await openBgprojArchive(importFile, importPassword, {
        mode: 'merge',
        resolve: askAboutConflicts,
      });
      statusMsg = translate('workspace.archive.summaryLoaded', {
        examCount: result.examCount,
        studentCount: result.studentCount,
      });
      if (result.errors.length > 0) {
        errorMsg = result.errors.join('\n');
      }
      finishModeSwitch();
    } catch (err: any) {
      errorMsg = err.message;
      statusMsg = '';
    } finally {
      busy = false;
      importPassword = '';
    }
  }

  function handleSkipImport() {
    finishModeSwitch();
    reset();
    onClose();
  }

  function handleFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    importFile = input.files?.[0] ?? null;
  }
</script>

<Modal
  {open}
  size="lg"
  title={$t('storagePolicy.switch.title')}
  closeOnBackdrop={false}
  closeOnEscape={!busy && phase !== 'switching'}
  onClose={handleCancel}
>
  {#if pending}
    <ol class="mb-4 flex flex-wrap gap-2 text-xs text-subtle">
      {#each STEPS as step, i (step.phase)}
        <li
          class="rounded-full px-2 py-1
                 {phase === step.phase ? 'bg-accent-strong text-content' : 'bg-surface-sunken'}"
        >
          {i + 1}. {$t(step.labelKey)}
        </li>
      {/each}
    </ol>

    {#if phase === 'confirm'}
      <h4 class="text-sm font-semibold text-content">
        {$t('storagePolicy.switch.introHeading', {
          from: modeLabel(pending.from),
          to: modeLabel(pending.to),
        })}
      </h4>
      <p class="mt-2 text-sm text-muted">{$t('storagePolicy.switch.introBody')}</p>
      <p class="mt-2 text-sm text-muted">{$t('storagePolicy.switch.bridgeNote')}</p>
      <p class="mt-2 text-sm text-subtle">{$t('storagePolicy.switch.serverKeptNote')}</p>

      <label class="mt-4 flex items-start gap-2 text-sm text-content">
        <input type="checkbox" bind:checked={understood} class="mt-1" />
        <span>{$t('storagePolicy.switch.understandCheckbox')}</span>
      </label>
    {:else if phase === 'export'}
      <h4 class="text-sm font-semibold text-content">
        {$t('storagePolicy.switch.exportHeading')}
      </h4>
      <p class="mt-2 text-sm text-muted">{$t('storagePolicy.switch.exportBody')}</p>

      <Field label={$t('storagePolicy.switch.exportPasswordLabel')}>
        <TextInput type="password" bind:value={exportPassword} autocomplete="new-password" />
      </Field>

      <div class="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !exportPassword} onClick={handleExport}>
          {$t('storagePolicy.switch.exportButton')}
        </Button>
        {#if workspaceEmpty}
          <Button variant="ghost" disabled={busy} onClick={markExportSkipped}>
            {$t('storagePolicy.switch.skipExportEmpty')}
          </Button>
        {:else}
          <Button variant="ghost" disabled={busy} onClick={markExportSkipped}>
            {$t('storagePolicy.switch.skipExportHaveArchive')}
          </Button>
        {/if}
      </div>
    {:else if phase === 'exported' || phase === 'switching'}
      <h4 class="text-sm font-semibold text-content">{$t('storagePolicy.switch.wipeHeading')}</h4>
      <p class="mt-2 text-sm text-amber-300">
        {$t('storagePolicy.switch.wipeWarning', { to: modeLabel(pending.to) })}
      </p>
      {#if pending.archiveFilename}
        <p class="mt-2 text-xs text-subtle">
          {$t('storagePolicy.switch.exportDone', { filename: pending.archiveFilename })}
        </p>
      {/if}
    {:else if phase === 'reimport'}
      <h4 class="text-sm font-semibold text-content">{$t('storagePolicy.switch.importHeading')}</h4>
      <p class="mt-2 text-sm text-muted">{$t('storagePolicy.switch.importBody')}</p>

      <Field label={$t('storagePolicy.switch.importChooseFile')}>
        <input
          type="file"
          accept=".bgproj"
          on:change={handleFileSelected}
          class="w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0
                 file:bg-surface-inset file:px-3 file:py-1.5 file:text-sm file:text-content"
        />
      </Field>
      <Field label={$t('storagePolicy.switch.importPasswordLabel')}>
        <TextInput type="password" bind:value={importPassword} autocomplete="off" />
      </Field>
    {/if}

    {#if statusMsg}
      <p class="mt-3 text-sm text-accent">{statusMsg}</p>
    {/if}
    {#if errorMsg}
      <p class="mt-3 whitespace-pre-wrap text-sm text-red-400">{errorMsg}</p>
    {/if}
  {:else if errorMsg}
    <p class="text-sm text-red-400">{errorMsg}</p>
  {/if}

  <svelte:fragment slot="footer">
    {#if phase === 'confirm'}
      <Button variant="secondary" onClick={handleCancel}>
        {$t('storagePolicy.switch.cancel')}
      </Button>
      <Button variant="primary" disabled={!understood} onClick={requireExport}>
        {$t('storagePolicy.switch.stepExport')}
      </Button>
    {:else if phase === 'export'}
      <Button variant="secondary" disabled={busy} onClick={handleCancel}>
        {$t('storagePolicy.switch.cancel')}
      </Button>
      <span class="text-xs text-subtle">{$t('storagePolicy.switch.exportRequired')}</span>
    {:else if phase === 'exported' || phase === 'switching'}
      <Button variant="secondary" disabled={busy} onClick={handleCancel}>
        {$t('storagePolicy.switch.cancel')}
      </Button>
      <Button variant="danger" loading={busy} onClick={handleCommit}>
        {$t('storagePolicy.switch.wipeButton')}
      </Button>
    {:else if phase === 'reimport'}
      <Button variant="secondary" disabled={busy} onClick={handleSkipImport}>
        {$t('storagePolicy.switch.importSkip')}
      </Button>
      <Button
        variant="primary"
        loading={busy}
        disabled={!importFile || !importPassword}
        onClick={handleImport}
      >
        {$t('storagePolicy.switch.importButton')}
      </Button>
    {/if}
  </svelte:fragment>
</Modal>

<ImportConflictModal
  open={conflictsOpen}
  conflicts={pendingConflicts}
  identicalCount={pendingIdenticalCount}
  onConfirm={handleConflictsConfirmed}
  onCancel={handleConflictsCancelled}
/>
