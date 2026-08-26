<script lang="ts">
  /**
   * Shows a freshly issued set of backup codes, once.
   *
   * They are the way back into an account when the phone is gone, so the dialog
   * does not close on backdrop or Escape and the confirm button waits for an
   * explicit acknowledgement.
   */
  import { Button, Modal } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  export let codes: string[];
  export let onConfirm: () => void;

  let acknowledged = false;

  function download() {
    const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = $t("security.backupCodes.fileName");
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<Modal
  open={true}
  size="md"
  title={$t("security.backupCodes.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">{$t("security.backupCodes.intro")}</p>
    <p
      class="rounded-lg border border-line-strong bg-surface-sunken p-3 text-sm text-content"
      role="alert"
    >
      {$t("security.backupCodes.warning")}
    </p>

    <ul class="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
      {#each codes as code (code)}
        <li
          class="rounded-md bg-surface-inset px-3 py-2 text-center font-mono text-sm
                 tracking-widest text-content select-all"
        >
          {code}
        </li>
      {/each}
    </ul>

    <div>
      <Button variant="secondary" onClick={download}>
        {$t("security.backupCodes.download")}
      </Button>
    </div>

    <label class="flex items-start gap-2 text-sm text-content">
      <input type="checkbox" bind:checked={acknowledged} class="mt-1" />
      <span>{$t("security.backupCodes.confirmLabel")}</span>
    </label>
  </div>

  <svelte:fragment slot="footer">
    <Button disabled={!acknowledged} onClick={onConfirm}>
      {$t("security.backupCodes.done")}
    </Button>
  </svelte:fragment>
</Modal>
