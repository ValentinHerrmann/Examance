<script lang="ts">
  import { httpErrorStore } from "#lib/stores/httpErrorStore";
  import { t, tOptional } from "#lib/i18n";
  import { Modal } from "#lib/components/ui";

  // Status is rendered as text: the old http.cat image leaked IP/User-Agent/status to a third party
  // and cannot be self-hosted (licence). See docs/legal_audit_dsgvo.md, finding L16.

  let status = $derived($httpErrorStore.status);

  // Titles live under `errors.http.<status>`; unmapped statuses fall back to a generic label.
  let statusText =
    $derived($tOptional(`errors.http.${status}`) ?? $t("errors.httpFallback"));

  function handleClose() {
    httpErrorStore.closeError();
  }
</script>

<Modal open={$httpErrorStore.isOpen} size="small" title={statusText} onClose={handleClose}>
  <div class="flex min-h-48 items-center justify-center rounded-md border border-line bg-surface-base p-8">
    <div class="flex flex-col items-center gap-2 text-center text-muted">
      <div class="text-4xl font-bold text-danger-fg">{status}</div>
    </div>
  </div>
</Modal>
