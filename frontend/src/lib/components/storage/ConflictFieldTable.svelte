<script lang="ts">
  /**
   * Field-by-field comparison of two versions of one record.
   *
   * Deliberately not `ExerciseDiffModal`: that one is bound to `ExerciseRecord`
   * and mounts two live CodeMirror editors with scroll syncing and per-side save
   * buttons. This is a read-only view of arbitrary records, so it reuses only
   * the diff engine, not the editor.
   */
  // `field.key` is composed at runtime, so it goes through tOptional — a
  // missing entry falls back to the raw key instead of being a type error.
  import { t, tOptional } from '$lib/i18n';
  import type { ConflictField } from '$lib/archive/conflicts';

  export let fields: ConflictField[] = [];

  const cell = 'px-3 py-2 align-top break-words';
</script>

<div class="overflow-x-auto">
  <table class="w-full min-w-0 table-fixed border-collapse text-sm">
    <thead>
      <tr class="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
        <th class="{cell} w-1/4">&nbsp;</th>
        <th class="{cell} w-[37.5%]">{$t('storagePolicy.conflict.columnExisting')}</th>
        <th class="{cell} w-[37.5%]">{$t('storagePolicy.conflict.columnImported')}</th>
      </tr>
    </thead>
    <tbody>
      {#each fields as field (field.key)}
        <tr class="border-b border-line/50 {field.differs ? 'bg-amber-500/5' : ''}">
          <td class="{cell} text-muted">
            {$tOptional(`storagePolicy.conflict.field.${field.key}`) ?? field.key}
          </td>
          <td class="{cell} {field.differs ? 'text-content' : 'text-subtle'}">
            {field.existing ?? $t('storagePolicy.conflict.noValue')}
          </td>
          <td class="{cell} {field.differs ? 'font-medium text-accent' : 'text-subtle'}">
            {field.imported ?? $t('storagePolicy.conflict.noValue')}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
