<script lang="ts">
  /**
   * Asks which version of a colliding record should win.
   *
   * This replaces `createWithIdFallback`'s blind answer to a 409 — mint a fresh
   * UUID and carry on — which silently produced a second copy of everything
   * whenever an archive was re-imported onto the account it came from, with no
   * way afterwards to tell the copies apart.
   *
   * Nothing is written until every conflict has a decision, so cancelling here
   * costs nothing.
   */
  import { t, tOptional } from '$lib/i18n';
  import { Modal, Button, Select } from '$lib/components/ui';
  import { computeSideBySideDiff } from '$lib/latex/diff';
  import ConflictFieldTable from './ConflictFieldTable.svelte';
  import {
    applyToAll,
    type ArchiveConflict,
    type ConflictChoice,
    type DecisionMap,
  } from '$lib/archive/conflicts';

  export let open = false;
  export let conflicts: ArchiveConflict[] = [];
  export let identicalCount = 0;
  export let onConfirm: (decisions: DecisionMap) => void;
  export let onCancel: () => void;

  let decisions: DecisionMap = new Map();
  let activeIndex = 0;

  $: active = conflicts[activeIndex] ?? null;
  $: decidedCount = conflicts.filter((c) => decisions.has(c.id)).length;
  $: allDecided = decidedCount === conflicts.length && conflicts.length > 0;

  /** Grouped for the "apply to all in this category" control. */
  $: grouped = conflicts.reduce((acc, conflict) => {
    const bucket = acc.get(conflict.kind) ?? [];
    bucket.push(conflict);
    acc.set(conflict.kind, bucket);
    return acc;
  }, new Map<string, ArchiveConflict[]>());

  $: diff =
    active?.textDiff && active.textDiff.existing !== active.textDiff.imported
      ? computeSideBySideDiff(active.textDiff.existing, active.textDiff.imported)
      : null;

  function choose(conflict: ArchiveConflict, choice: ConflictChoice) {
    decisions.set(conflict.id, { id: conflict.id, kind: conflict.kind, choice });
    decisions = new Map(decisions);
    // Move to the next undecided conflict, so a run of them is one click each.
    const next = conflicts.findIndex((c, i) => i > activeIndex && !decisions.has(c.id));
    if (next !== -1) activeIndex = next;
  }

  function chooseForAll(choice: ConflictChoice) {
    decisions = applyToAll(conflicts, choice, decisions);
  }

  function chooseForKind(kind: string, choice: ConflictChoice) {
    decisions = applyToAll(grouped.get(kind) ?? [], choice, decisions);
  }

  function handleGroupChoice(kind: string, event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const choice = select.value as ConflictChoice;
    if (choice) chooseForKind(kind, choice);
    // Back to the placeholder, so picking the same option twice still fires and
    // the control never claims a state it has not applied.
    select.value = '';
  }

  function handleCancel() {
    if (conflicts.length > 0 && !confirm($t('storagePolicy.conflict.cancelConfirm'))) return;
    onCancel();
  }

  const kindLabel = (kind: string) =>
    $tOptional(`storagePolicy.conflict.kind.${kind}`) ?? kind;
</script>

<Modal {open} size="xl" title={$t('storagePolicy.conflict.title')} onClose={handleCancel}>
  <p class="text-sm text-muted">{$t('storagePolicy.conflict.subtitle')}</p>
  {#if identicalCount > 0}
    <p class="mt-1 text-xs text-subtle">
      {$t('storagePolicy.conflict.identicalSkipped', { count: identicalCount })}
    </p>
  {/if}

  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
    <span class="text-subtle">{$t('storagePolicy.conflict.applyToAll')}:</span>
    <Button size="sm" variant="secondary" onClick={() => chooseForAll('keep-existing')}>
      {$t('storagePolicy.conflict.choiceKeepExisting')}
    </Button>
    <Button size="sm" variant="secondary" onClick={() => chooseForAll('take-imported')}>
      {$t('storagePolicy.conflict.choiceTakeImported')}
    </Button>
  </div>

  <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
    <!-- Conflict list, grouped by kind -->
    <div class="min-w-0 max-h-72 overflow-y-auto rounded-lg border border-line lg:max-h-[26rem]">
      {#each [...grouped] as [kind, group] (kind)}
        <div class="border-b border-line last:border-b-0">
          <div class="flex items-center justify-between gap-2 bg-surface-sunken px-3 py-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-muted">
              {kindLabel(kind)} ({group.length})
            </span>
            <Select class="max-w-[11rem] text-xs" on:change={(e) => handleGroupChoice(kind, e)}>
              <option value="">{$t('storagePolicy.conflict.applyToAllInGroup')}</option>
              <option value="keep-existing">
                {$t('storagePolicy.conflict.choiceKeepExisting')}
              </option>
              <option value="take-imported">
                {$t('storagePolicy.conflict.choiceTakeImported')}
              </option>
            </Select>
          </div>
          {#each group as conflict (conflict.id)}
            {@const index = conflicts.indexOf(conflict)}
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm
                     {index === activeIndex ? 'bg-surface-inset text-content' : 'text-muted'}"
              on:click={() => (activeIndex = index)}
            >
              <span class="min-w-0 truncate">{conflict.title}</span>
              {#if decisions.has(conflict.id)}
                <span class="shrink-0 text-xs text-accent">✓</span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>

    <!-- Side-by-side comparison of the selected conflict -->
    <div class="min-w-0">
      {#if active}
        <h4 class="text-sm font-semibold text-content">
          {kindLabel(active.kind)} — {active.title}
        </h4>

        <div class="mt-2 rounded-lg border border-line">
          <ConflictFieldTable fields={active.fields} />
        </div>

        {#if diff}
          <h5 class="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">
            {$t('storagePolicy.conflict.textDiffHeading')}
          </h5>
          <div class="mt-1 grid grid-cols-2 gap-2">
            <pre class="max-h-56 overflow-auto rounded-lg border border-line bg-surface-sunken p-2
                        text-[11px] leading-snug text-muted whitespace-pre-wrap break-words">{active
                .textDiff?.existing ?? ''}</pre>
            <pre class="max-h-56 overflow-auto rounded-lg border border-line bg-surface-sunken p-2
                        text-[11px] leading-snug text-content whitespace-pre-wrap break-words">{active
                .textDiff?.imported ?? ''}</pre>
          </div>
        {/if}

        <div class="mt-4 flex flex-wrap gap-2">
          <Button
            variant={decisions.get(active.id)?.choice === 'keep-existing' ? 'primary' : 'secondary'}
            onClick={() => choose(active, 'keep-existing')}
          >
            {$t('storagePolicy.conflict.choiceKeepExisting')}
          </Button>
          <Button
            variant={decisions.get(active.id)?.choice === 'take-imported' ? 'primary' : 'secondary'}
            onClick={() => choose(active, 'take-imported')}
          >
            {$t('storagePolicy.conflict.choiceTakeImported')}
          </Button>
          {#if active.allowCopy}
            <Button
              variant={decisions.get(active.id)?.choice === 'import-as-copy'
                ? 'primary'
                : 'secondary'}
              onClick={() => choose(active, 'import-as-copy')}
            >
              {$t('storagePolicy.conflict.choiceImportAsCopy')}
            </Button>
          {/if}
        </div>
        {#if !active.allowCopy}
          <p class="mt-2 text-xs text-subtle">
            {$t('storagePolicy.conflict.copyNotAllowed')}
          </p>
        {/if}
      {/if}
    </div>
  </div>

  <svelte:fragment slot="footer">
    <span class="mr-auto text-xs text-subtle">
      {$t('storagePolicy.conflict.counter', { decided: decidedCount, total: conflicts.length })}
    </span>
    <Button variant="secondary" onClick={handleCancel}>
      {$t('storagePolicy.conflict.cancel')}
    </Button>
    <Button variant="primary" disabled={!allDecided} onClick={() => onConfirm(decisions)}>
      {$t('storagePolicy.conflict.apply')}
    </Button>
  </svelte:fragment>
</Modal>
