<script lang="ts">
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '#lib/i18n';
  import { Checkbox } from '#lib/components/ui';
  import { statisticsRepository } from '#lib/repositories/statisticsRepository';
  import { sessionStore } from '#lib/stores/session';

  /** The exam delete's "keep in my personal statistics" choice (issue #238), one for all exams deleted together (issue #261), shown only when one of them has a record; the caller sends it with `statisticsRepository.setKeep(id, keep)` for each of `recordIds` before deleting. */
  interface Props {
    /** Empty while the dialog is closed. */
    examIds: readonly string[];
    keep?: boolean;
    recordIds?: string[];
  }

  let { examIds, keep = $bindable(true), recordIds = $bindable([]) }: Props = $props();

  let loadSeq = 0;

  async function load(ids: readonly string[]) {
    const seq = ++loadSeq;
    recordIds = [];
    keep = true;
    if (!ids.length) return;
    const key = get(sessionStore).sessionKey;
    const found = await Promise.all(
      ids.map(async (id) => {
        try {
          return (await statisticsRepository.findByExam(id, key))?.id ?? null;
        } catch (err) {
          // Without the record the server keeps it (its default), which is the checked choice.
          console.warn('Kept statistics could not be read:', err);
          return null;
        }
      }),
    );
    if (seq === loadSeq) recordIds = found.filter((id): id is string => id !== null);
  }

  $effect.pre(() => {
    const ids = examIds.join(',');
    untrack(() => load(ids ? ids.split(',') : []));
  });
</script>

{#if recordIds.length}
  <div class="mt-3">
    <Checkbox bind:checked={keep} label={$t('stats.keepOption.label')} />
    <p class="m-0 mt-1 text-sm text-muted">{$t('stats.keepOption.hint')}</p>
  </div>
{/if}
