<script lang="ts">
  /**
   * Shows a freshly minted recovery code exactly once.
   *
   * The code is the only factor that always works: a passkey may not support
   * PRF, and a forgotten password is precisely the situation this exists for.
   * So the dialog cannot be dismissed by backdrop or Escape, and the confirm
   * button stays disabled until the teacher ticks that they have stored it.
   */
  import { Button, Modal } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  export let code: string;
  export let onConfirm: () => void;

  let acknowledged = false;
  let copied = false;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be refused outright (permissions, insecure
      // context). The code is on screen either way, so this is not an error
      // worth interrupting anyone over.
    }
  }

  function download() {
    const blob = new Blob([`${code}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = $t("security.recovery.fileName");
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<Modal
  open={true}
  size="md"
  title={$t("security.recovery.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">{$t("security.recovery.intro")}</p>

    <p
      class="rounded-lg border border-line-strong bg-surface-sunken p-3 text-sm text-content"
      role="alert"
    >
      {$t("security.recovery.warning")}
    </p>

    <code
      class="block overflow-x-auto rounded-lg bg-surface-inset p-4 text-center font-mono
             text-base tracking-widest text-content select-all sm:text-lg"
    >
      {code}
    </code>

    <div class="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={copy}>
        {copied ? $t("security.recovery.copied") : $t("security.recovery.copy")}
      </Button>
      <Button variant="secondary" onClick={download}>
        {$t("security.recovery.download")}
      </Button>
    </div>

    <label class="flex items-start gap-2 text-sm text-content">
      <input type="checkbox" bind:checked={acknowledged} class="mt-1" />
      <span>{$t("security.recovery.confirmLabel")}</span>
    </label>
  </div>

  <svelte:fragment slot="footer">
    <Button disabled={!acknowledged} onClick={onConfirm}>
      {$t("security.recovery.confirm")}
    </Button>
  </svelte:fragment>
</Modal>
