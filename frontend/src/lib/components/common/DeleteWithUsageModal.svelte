<script lang="ts">
  import { t } from "#lib/i18n";
  import { Alert, ConfirmDeleteModal } from "#lib/components/ui";

  /**
   * Delete confirmation for a record other data may depend on (exam with submissions, exercise used in exams):
   * plain prompt without usage, a warning with an optional affected-items list with usage. Wording comes from the
   * caller; chrome, busy state and inline error from ConfirmDeleteModal.
   */
  interface Props {
    open?: boolean;
    title: string;
    /** Usage lookup still running. */
    usageLoading?: boolean;
    loadingText?: string;
    /** Set when something depends on the record; `usageTitle` is the alert heading. */
    usageTitle?: string;
    usageText?: string;
    usageHint?: string;
    items?: { id: string; title: string; meta?: string | null }[];
    plainText: string;
    busy?: boolean;
    error?: string;
    onConfirm: () => void;
    onClose: () => void;
  }

  let {
    open = false,
    title,
    usageLoading = false,
    loadingText = "",
    usageTitle = "",
    usageText = "",
    usageHint = "",
    items = [],
    plainText,
    busy = false,
    error = "",
    onConfirm,
    onClose,
  }: Props = $props();
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
