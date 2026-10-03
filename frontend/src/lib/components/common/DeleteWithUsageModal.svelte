<script lang="ts">
  import { t } from "$lib/i18n";
  import { Alert, ConfirmDeleteModal } from "$lib/components/ui";

  /**
   * Delete confirmation for a record other data may depend on (an exam with
   * submissions, an exercise used in exams). Without usage it asks plainly;
   * with usage it warns and optionally lists what is affected. Wording comes
   * from the caller's namespace; chrome, busy state and inline error come from
   * ConfirmDeleteModal.
   */
  export let open = false;
  export let title: string;
  /** Usage lookup still running. */
  export let usageLoading = false;
  export let loadingText = "";
  /** Set when something depends on the record; `usageTitle` is the alert heading. */
  export let usageTitle = "";
  export let usageText = "";
  export let usageHint = "";
  export let items: { id: string; title: string; meta?: string | null }[] = [];
  export let plainText: string;
  export let busy = false;
  export let error = "";
  export let onConfirm: () => void;
  export let onClose: () => void;
</script>

<ConfirmDeleteModal
  {open}
  {title}
  isDeleteLoading={usageLoading}
  {busy}
  {error}
  confirmLabel={$t("common.deleteModal.deleteAnyway")}
  cancelLabel={$t("common.cancel")}
  {onConfirm}
  {onClose}
>
  {#if usageLoading}
    <p class="m-0 text-muted">{loadingText}</p>
  {:else if usageText}
    <Alert severity="danger" title={usageTitle}>
      <p class="m-0">{usageText}</p>
      {#if items.length > 0}
        <ul class="my-2 pl-6">
          {#each items as item (item.id)}
            <li>
              <strong>{item.title}</strong>
              {#if item.meta}<span class="ml-1.5 text-sm text-muted">({item.meta})</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if usageHint}<p class="m-0 mt-1 text-sm text-muted">{usageHint}</p>{/if}
    </Alert>
  {:else}
    <p class="m-0">{plainText}</p>
  {/if}
</ConfirmDeleteModal>
