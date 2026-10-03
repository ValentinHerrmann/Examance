<script lang="ts">
  import { t } from "$lib/i18n";
  import { Button, TextInput } from "$lib/components/ui";
  interface UnmatchedSubmission {
    submissionId: string;
    studentId: string;
    currentFallback: string;
    newCode: string;
  }

  interface Props {
    unmatchedList?: UnmatchedSubmission[];
    onUpdateFallbackCode: (item: UnmatchedSubmission) => void;
  }

  let { unmatchedList = [], onUpdateFallbackCode }: Props = $props();
</script>

{#if unmatchedList.length > 0}
  <div class="mt-10 min-w-0 rounded-xl border border-warning bg-surface-raised p-4 sm:p-6">
    <h3 class="m-0 mb-1 text-lg font-semibold text-content">{$t("scanning.unmatchedResolver.title")}</h3>
    <p class="mb-4 text-sm text-muted">
      {$t("scanning.unmatchedResolver.description")}
    </p>

    <div>
      {#each unmatchedList as item}
        <div class="mb-3 flex flex-col gap-2 rounded-md bg-surface-sunken p-3 sm:flex-row sm:items-center sm:gap-4">
          <span class="font-mono text-sm break-all text-danger-fg">{item.currentFallback}</span>
          <TextInput
            class="sm:flex-1"
            placeholder={$t("scanning.unmatchedResolver.placeholder")}
            bind:value={item.newCode}
          />
          <Button onClick={() => onUpdateFallbackCode(item)}>{$t("scanning.unmatchedResolver.linkCode")}</Button>
        </div>
      {/each}
    </div>
  </div>
{/if}
