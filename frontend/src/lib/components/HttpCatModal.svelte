<script lang="ts">
  import { httpErrorStore } from "#lib/stores/httpErrorStore";
  import { t, tOptional } from "#lib/i18n";
  import { Modal } from "#lib/components/ui";

  // The status image comes from http.cat on purpose (issue #59): only IP, User-Agent and status code leave the browser
  // (no Referer, no cookies, only while the modal is open). It cannot be self-hosted (licence); CSP img-src allows
  // exactly this host (docs/legal_audit_dsgvo.md, finding L16).

  let status = $derived($httpErrorStore.status);

  // Titles live under `errors.http.<status>`; unmapped statuses fall back to a generic label.
  let statusText =
    $derived($tOptional(`errors.http.${status}`) ?? $t("errors.httpFallback"));

  // The text rendering stays visible until the image has loaded, and remains if it fails.
  // Keyed by status so a new error starts from the text again without an effect.
  let loadedFor = $state<number | null>(null);
  let failedFor = $state<number | null>(null);
  let loaded = $derived(loadedFor === status);
  let failed = $derived(failedFor === status);

  function handleClose() {
    httpErrorStore.closeError();
  }
</script>

<Modal open={$httpErrorStore.isOpen} size="small" title={statusText} onClose={handleClose}>
  <div class="flex min-h-48 items-center justify-center rounded-md border border-line bg-surface-base p-8">
    {#if !loaded || failed}
      <div class="flex flex-col items-center gap-2 text-center text-muted">
        <div class="text-4xl font-bold text-danger-fg">{status}</div>
      </div>
    {/if}
    {#if $httpErrorStore.isOpen && status && !failed}
      <img
        src={`https://http.cat/${status}`}
        alt={statusText}
        referrerpolicy="no-referrer"
        loading="eager"
        decoding="async"
        class="max-h-[60vh] w-full rounded-md object-contain"
        class:hidden={!loaded}
        onload={() => (loadedFor = status)}
        onerror={() => (failedFor = status)}
      />
    {/if}
  </div>
</Modal>
