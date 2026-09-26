<script lang="ts">
  /**
   * Asks which version of each colliding record should win. Mounted once in the
   * root layout and driven by `conflictPrompt`; nothing is written until every
   * conflict has a decision, so cancelling costs nothing.
   */
  import { t, tOptional } from '$lib/i18n';
  import { Modal, Button } from '$lib/components/ui';
  import { conflictPrompt } from '$lib/stores/conflictPrompt';
  import {
    applyToAll,
    type ArchiveConflict,
    type ConflictChoice,
    type DecisionMap,
  } from '$lib/archive/conflicts';

  const CHOICES: { choice: ConflictChoice; label: 'storagePolicy.conflict.choiceKeepExisting' | 'storagePolicy.conflict.choiceTakeImported' | 'storagePolicy.conflict.choiceImportAsCopy' }[] = [
    { choice: 'keep-existing', label: 'storagePolicy.conflict.choiceKeepExisting' },
    { choice: 'take-imported', label: 'storagePolicy.conflict.choiceTakeImported' },
    { choice: 'import-as-copy', label: 'storagePolicy.conflict.choiceImportAsCopy' },
  ];

  let decisions: DecisionMap = new Map();
  let activeIndex = 0;

  $: prompt = $conflictPrompt;
  $: conflicts = prompt?.conflicts ?? [];
  $: active = conflicts[activeIndex] as ArchiveConflict | undefined;
  $: decidedCount = conflicts.filter((c) => decisions.has(c.id)).length;
  $: textDiffers = !!active?.textDiff && active.textDiff.existing !== active.textDiff.imported;

  const kindLabel = (kind: string) => $tOptional(`storagePolicy.conflict.kind.${kind}`) ?? kind;
  const fieldLabel = (key: string) => $tOptional(`storagePolicy.conflict.field.${key}`) ?? key;

  function choose(conflict: ArchiveConflict, choice: ConflictChoice) {
    decisions = new Map(decisions).set(conflict.id, { id: conflict.id, kind: conflict.kind, choice });
    const next = conflicts.findIndex((c, i) => i > activeIndex && !decisions.has(c.id));
    if (next !== -1) activeIndex = next;
  }

  function close(settle: (p: NonNullable<typeof prompt>) => void) {
    if (prompt) settle(prompt);
    conflictPrompt.set(null);
    decisions = new Map();
    activeIndex = 0;
  }

  function handleCancel() {
    if (!confirm($t('storagePolicy.conflict.cancelConfirm'))) return;
    close((p) => p.reject(new Error($t('workspace.archive.importCancelled'))));
  }
</script>

<Modal open={!!prompt} size="xl" title={$t('storagePolicy.conflict.title')} onClose={handleCancel}>
  <p class="text-sm text-muted">{$t('storagePolicy.conflict.subtitle')}</p>
  {#if prompt?.identicalCount}
    <p class="mt-1 text-xs text-subtle">
      {$t('storagePolicy.conflict.identicalSkipped', { count: prompt.identicalCount })}
    </p>
  {/if}

  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
    <span class="text-subtle">{$t('storagePolicy.conflict.applyToAll')}:</span>
    {#each CHOICES.slice(0, 2) as { choice, label }}
      <Button size="sm" variant="secondary" onClick={() => (decisions = applyToAll(conflicts, choice, decisions))}>
        {$t(label)}
      </Button>
    {/each}
  </div>

  <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
    <ul class="max-h-72 min-w-0 overflow-y-auto rounded-lg border border-line lg:max-h-[26rem]">
      {#each conflicts as conflict, i (conflict.kind + conflict.id)}
        <li>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm
                   {i === activeIndex ? 'bg-surface-inset text-content' : 'text-muted'}"
            on:click={() => (activeIndex = i)}
          >
            <span class="min-w-0 truncate">
              <span class="text-xs uppercase text-subtle">{kindLabel(conflict.kind)}</span>
              {conflict.title}
            </span>
            {#if decisions.has(conflict.id)}<span class="shrink-0 text-xs text-accent">✓</span>{/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if active}
      <div class="min-w-0">
        <h4 class="text-sm font-semibold text-content">{kindLabel(active.kind)} — {active.title}</h4>

        <div class="mt-2 overflow-x-auto rounded-lg border border-line">
          <table class="w-full table-fixed text-sm">
            <thead class="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th class="w-1/4 px-3 py-2"></th>
                <th class="px-3 py-2">{$t('storagePolicy.conflict.columnExisting')}</th>
                <th class="px-3 py-2">{$t('storagePolicy.conflict.columnImported')}</th>
              </tr>
            </thead>
            <tbody>
              {#each active.fields as field (field.key)}
                <tr class="border-b border-line/50 {field.differs ? 'bg-amber-500/5' : ''}">
                  <td class="px-3 py-2 align-top text-muted">{fieldLabel(field.key)}</td>
                  <td class="break-words px-3 py-2 align-top {field.differs ? 'text-content' : 'text-subtle'}">
                    {field.existing ?? $t('storagePolicy.conflict.noValue')}
                  </td>
                  <td class="break-words px-3 py-2 align-top {field.differs ? 'font-medium text-accent' : 'text-subtle'}">
                    {field.imported ?? $t('storagePolicy.conflict.noValue')}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if textDiffers && active.textDiff}
          <h5 class="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">
            {$t('storagePolicy.conflict.textDiffHeading')}
          </h5>
          <div class="mt-1 grid grid-cols-2 gap-2">
            {#each [active.textDiff.existing, active.textDiff.imported] as text, i}
              <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line
                          bg-surface-sunken p-2 text-[11px] leading-snug {i ? 'text-content' : 'text-muted'}">{text}</pre>
            {/each}
          </div>
        {/if}

        <div class="mt-4 flex flex-wrap gap-2">
          {#each CHOICES as { choice, label }}
            {#if choice !== 'import-as-copy' || active.allowCopy}
              <Button
                variant={decisions.get(active.id)?.choice === choice ? 'primary' : 'secondary'}
                onClick={() => active && choose(active, choice)}
              >
                {$t(label)}
              </Button>
            {/if}
          {/each}
        </div>
        {#if !active.allowCopy}
          <p class="mt-2 text-xs text-subtle">{$t('storagePolicy.conflict.copyNotAllowed')}</p>
        {/if}
      </div>
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <span class="mr-auto text-xs text-subtle">
      {$t('storagePolicy.conflict.counter', { decided: decidedCount, total: conflicts.length })}
    </span>
    <Button variant="secondary" onClick={handleCancel}>{$t('storagePolicy.conflict.cancel')}</Button>
    <Button
      variant="primary"
      disabled={decidedCount < conflicts.length}
      onClick={() => close((p) => p.resolve(decisions))}
    >
      {$t('storagePolicy.conflict.apply')}
    </Button>
  </svelte:fragment>
</Modal>
