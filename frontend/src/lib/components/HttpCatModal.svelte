<script lang="ts">
  import { httpErrorStore } from "$lib/stores/httpErrorStore";
  import { t, tOptional } from "$lib/i18n";
  import { Modal } from "$lib/components/ui";

  // This modal used to render an image from the http.cat service, which
  // disclosed the user's IP, User-Agent and the failing status code to a third
  // party on every API error — in an app whose compliance documents state the
  // browser contacts no external host. The artwork is not licensed for
  // redistribution, so self-hosting it was not an option; the status is
  // rendered as text instead. See docs/legal_audit_dsgvo.md, finding L16.

  $: status = $httpErrorStore.status;

  // Status titles live in the catalogs under `errors.http.<status>`; an
  // unmapped status falls back to a generic label. `$t` is referenced so the
  // title re-renders on a language switch.
  $: statusText =
    $tOptional(`errors.http.${status}`) ?? $t("errors.httpFallback");

  function handleClose() {
    httpErrorStore.closeError();
  }
</script>

<Modal open={$httpErrorStore.isOpen} size="md" title={statusText} onClose={handleClose}>
  <div class="flex min-h-[200px] items-center justify-center rounded-lg border border-line bg-surface-base p-8">
    <div class="flex flex-col items-center gap-2 text-center text-muted">
      <div class="text-[2.5rem] font-bold text-red-500">{status}</div>
    </div>
  </div>
</Modal>
