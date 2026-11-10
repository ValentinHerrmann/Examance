<script lang="ts">
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '#lib/i18n';
  import { Checkbox } from '#lib/components/ui';
  import { statisticsRepository } from '#lib/repositories/statisticsRepository';
  import { sessionStore } from '#lib/stores/session';

  /** The exam delete's "keep in my personal statistics" choice (issue #238), shown only when the exam has a record; the caller sends it with `statisticsRepository.setKeep(recordId, keep)` before deleting. */
  interface Props {
    examId: string | null;
    keep?: boolean;
    recordId?: string | null;
  }

  let { examId, keep = $bindable(true), recordId = $bindable(null) }: Props = $props();

  let loadSeq = 0;

  async function load(id: string | null) {
    const seq = ++loadSeq;
    recordId = null;
    keep = true;
    if (!id) return;
    try {
      const stored = await statisticsRepository.findByExam(id, get(sessionStore).sessionKey);
      if (seq === loadSeq) recordId = stored?.id ?? null;
    } catch (err) {
      // Without the record list the server keeps the record (its default), which is the checked choice.
      console.warn('Kept statistics could not be read:', err);
    }
  }

  $effect.pre(() => {
    const id = examId;
    untrack(() => load(id));
  });
</script>

{#if recordId}
  <div class="mt-3">
    <Checkbox bind:checked={keep} label={$t('stats.keepOption.label')} />
    <p class="m-0 mt-1 text-sm text-muted">{$t('stats.keepOption.hint')}</p>
  </div>
{/if}
