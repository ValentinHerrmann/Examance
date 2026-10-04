<script lang="ts">
  // The fluent storage-mode change: explain → (optional backup) → move the results → keep or delete
  // the old copy → reload. Nothing is wiped up front; the account's mode changes only after every
  // result arrived (services/resultsMover.ts). Also used for the account's first choice.
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { t, translate } from '#lib/i18n';
  import { Alert, Badge, Button, Modal, Spinner } from '#lib/components/ui';
  import { ApiError } from '#lib/api/client';
  import { getStoragePolicyBadge, storagePolicyStore, type StorageMode } from '#lib/stores/storagePolicy';
  import {
    deleteOldCopy,
    directionFor,
    hasResultsToMove,
    moveProgressStore,
    moveResults,
    type MoveResult,
  } from '#lib/services/resultsMover';
  import { PendingWritesError } from '#lib/services/storageModeSwitch';
  import { flushOfflineQueue, pendingWritesCount } from '#lib/services/offlineQueue';
  import { exportArchiveInteractively } from '#lib/services/archiveService';

  interface Props {
    open?: boolean;
    /** The mode to change to. */
    target?: StorageMode | null;
    onClose: () => void;
  }

  let { open = false, target = null, onClose }: Props = $props();

  type Step = 'explain' | 'moving' | 'cleanup' | 'done';
  const STEPS = [
    { step: 'explain', label: 'storagePolicy.switch.stepExplain' },
    { step: 'moving', label: 'storagePolicy.switch.stepMove' },
    { step: 'cleanup', label: 'storagePolicy.switch.stepCleanup' },
    { step: 'done', label: 'storagePolicy.switch.stepDone' },
  ] as const;

  let step: Step = $state('explain');
  let from: StorageMode | null = $state(null);
  let somethingToMove: boolean | null = $state(null);
  let busy = $state(false);
  let errorMsg = $state('');
  let blockedByPendingWrites = $state(false);
  let result = $state.raw<MoveResult | null>(null);
  let deleted = $state.raw<{ students: number; submissions: number } | null>(null);
  let backupDone = $state(false);

  let direction = $derived(target ? directionFor(target) : 'to-server');
  let toLabel = $derived(target ? modeLabel(target) : '');
  let movedAnything = $derived(!!result && result.students + result.submissions + result.scores > 0);

  function modeLabel(mode: StorageMode | null): string {
    return getStoragePolicyBadge({ storageMode: mode, latexCompilation: 'local' }).text;
  }

  async function prepare() {
    step = 'explain';
    from = get(storagePolicyStore).storageMode;
    somethingToMove = null;
    errorMsg = '';
    result = null;
    deleted = null;
    backupDone = false;
    blockedByPendingWrites = get(pendingWritesCount) > 0;
    try {
      somethingToMove = target ? await hasResultsToMove(directionFor(target)) : false;
    } catch {
      // Unknown: the move itself will find out; say there may be something to move.
      somethingToMove = true;
    }
  }

  async function run(action: () => Promise<unknown>) {
    busy = true;
    errorMsg = '';
    try {
      await action();
    } catch (err: any) {
      if (err instanceof PendingWritesError) {
        blockedByPendingWrites = true;
      } else if (err instanceof ApiError && err.status === 409) {
        errorMsg = translate('storagePolicy.switch.changedElsewhere');
      } else if (err instanceof ApiError && err.status === 403) {
        errorMsg = translate('storagePolicy.notEnabled');
      } else {
        errorMsg = err?.message ?? String(err);
      }
      if (step === 'moving') step = 'explain';
    } finally {
      busy = false;
    }
  }

  async function handleSyncNow() {
    await flushOfflineQueue();
    if (get(pendingWritesCount) > 0) {
      errorMsg = translate('storagePolicy.switch.pendingWritesStill');
      return;
    }
    blockedByPendingWrites = false;
  }

  async function handleBackup() {
    const filename = `examance-${new Date().toISOString().slice(0, 10)}.bgproj`;
    if (await exportArchiveInteractively(filename)) backupDone = true;
  }

  async function handleMove() {
    if (!target) return;
    step = 'moving';
    result = await moveResults(from, target);
    step = movedAnything ? 'cleanup' : 'done';
  }

  async function handleDeleteOld() {
    deleted = await deleteOldCopy(direction);
    step = 'done';
  }

  function finish() {
    // Every list on the page was loaded under the old mode: start over rather than show stale rows.
    window.location.reload();
  }

  function handleCancel() {
    if (busy || step === 'moving') return;
    if (step === 'cleanup' || step === 'done') {
      finish();
      return;
    }
    onClose();
  }

  $effect.pre(() => {
    const isOpen = open;
    const to = target;
    if (isOpen && to) untrack(() => void prepare());
  });
</script>

<Modal
  {open}
  size="medium"
  title={$t('storagePolicy.switch.title', { to: toLabel })}
  closeOnBackdrop={false}
  closeOnEscape={!busy && step === 'explain'}
  onClose={step === 'moving' ? undefined : handleCancel}
>
  <ol class="mb-4 flex flex-wrap gap-2 text-xs text-muted">
    {#each STEPS as s, i (s.step)}
      <li><Badge severity={step === s.step ? 'primary' : 'secondary'}>{i + 1}. {$t(s.label)}</Badge></li>
    {/each}
  </ol>

  <div class="space-y-2 text-sm text-muted">
    {#if blockedByPendingWrites && step === 'explain'}
      <h4 class="font-semibold text-content">{$t('storagePolicy.switch.pendingWritesHeading')}</h4>
      <p>{$t('storagePolicy.switch.pendingWritesBody', { count: $pendingWritesCount })}</p>
    {:else if step === 'explain'}
      <h4 class="font-semibold text-content">
        {from
          ? $t('storagePolicy.switch.introHeading', { from: modeLabel(from), to: toLabel })
          : $t('storagePolicy.switch.firstChoiceHeading', { to: toLabel })}
      </h4>
      <p>
        {direction === 'to-browser'
          ? $t('storagePolicy.switch.toBrowserBody')
          : $t('storagePolicy.switch.toServerBody')}
      </p>
      <p>{$t('storagePolicy.switch.examsStay')}</p>
      {#if somethingToMove === null}
        <p class="flex items-center gap-2"><Spinner /> {$t('storagePolicy.switch.checking')}</p>
      {:else if !somethingToMove}
        <p>{$t('storagePolicy.switch.nothingToMove')}</p>
      {:else}
        <p>{$t('storagePolicy.switch.otherTabsNote')}</p>
        {#if from}
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outlined" severity="secondary" size="sm" disabled={busy} onClick={() => run(handleBackup)}>
              {$t('storagePolicy.switch.backupButton')}
            </Button>
            <span class="text-xs">
              {backupDone ? $t('storagePolicy.switch.backupDone') : $t('storagePolicy.switch.backupOptional')}
            </span>
          </div>
        {/if}
      {/if}
    {:else if step === 'moving'}
      <h4 class="font-semibold text-content">{$t('storagePolicy.switch.movingHeading')}</h4>
      {#if $moveProgressStore}
        <p>
          {$t('storagePolicy.switch.movingProgress', {
            done: $moveProgressStore.examsDone,
            total: $moveProgressStore.examsTotal,
            submissions: $moveProgressStore.submissions,
          })}
        </p>
      {/if}
      <p class="flex items-center gap-2"><Spinner /> {$t('storagePolicy.switch.movingKeepOpen')}</p>
    {:else if step === 'cleanup' && result}
      <h4 class="font-semibold text-content">{$t('storagePolicy.switch.cleanupHeading')}</h4>
      <p>
        {$t('storagePolicy.switch.movedSummary', {
          students: result.students,
          submissions: result.submissions,
          scores: result.scores,
        })}
      </p>
      <p>
        {direction === 'to-browser'
          ? $t('storagePolicy.switch.cleanupServerBody')
          : $t('storagePolicy.switch.cleanupBrowserBody')}
      </p>
    {:else if step === 'done'}
      <h4 class="font-semibold text-content">{$t('storagePolicy.switch.doneHeading', { to: toLabel })}</h4>
      {#if result && movedAnything}
        <p>
          {$t('storagePolicy.switch.movedSummary', {
            students: result.students,
            submissions: result.submissions,
            scores: result.scores,
          })}
        </p>
      {/if}
      {#if deleted}
        <p>
          {direction === 'to-browser'
            ? $t('storagePolicy.switch.purgeDone', { students: deleted.students, submissions: deleted.submissions })
            : $t('storagePolicy.switch.localDeleted')}
        </p>
      {/if}
    {/if}

    {#if result && result.skippedExams.length > 0}
      <Alert severity="warning">{$t('storagePolicy.switch.skippedExams', { count: result.skippedExams.length })}</Alert>
    {/if}
  </div>

  {#if errorMsg}
    <Alert severity="danger" class="mt-3 whitespace-pre-wrap">{errorMsg}</Alert>
  {/if}

  {#snippet footer()}
    {#if step === 'explain'}
      <Button variant="outlined" severity="secondary" disabled={busy} onClick={handleCancel}>
        {$t('storagePolicy.switch.cancel')}
      </Button>
      {#if blockedByPendingWrites}
        <Button loading={busy} onClick={() => run(handleSyncNow)}>{$t('storagePolicy.switch.pendingWritesSync')}</Button>
      {:else}
        <Button loading={busy} disabled={somethingToMove === null} onClick={() => run(handleMove)}>
          {somethingToMove ? $t('storagePolicy.switch.moveButton') : $t('storagePolicy.switch.chooseButton', { to: toLabel })}
        </Button>
      {/if}
    {:else if step === 'cleanup'}
      <Button variant="outlined" severity="secondary" disabled={busy} onClick={() => (step = 'done')}>
        {$t('storagePolicy.switch.keepOld')}
      </Button>
      <Button severity="danger" loading={busy} onClick={() => run(handleDeleteOld)}>
        {direction === 'to-browser'
          ? $t('storagePolicy.switch.deleteServerCopy')
          : $t('storagePolicy.switch.deleteBrowserCopy')}
      </Button>
    {:else if step === 'done'}
      <Button onClick={finish}>{$t('storagePolicy.switch.finish')}</Button>
    {/if}
  {/snippet}
</Modal>
