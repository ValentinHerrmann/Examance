<script lang="ts">
  /** Shows a fresh recovery code exactly once. It is the always-working factor (passkey may lack PRF), so no backdrop/Escape dismissal and confirm stays disabled until acknowledged. */
  import { Alert, Button, Checkbox, Modal } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  interface Props {
    code: string;
    onConfirm: () => void;
  }

  let { code, onConfirm }: Props = $props();

  let acknowledged = $state(false);
  let copied = $state(false);

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
  size="medium"
  title={$t("security.recovery.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">{$t("security.recovery.intro")}</p>

    <Alert severity="warning">{$t("security.recovery.warning")}</Alert>

    <code
      class="block overflow-x-auto rounded-md bg-surface-inset p-4 text-center font-mono
             text-base tracking-widest text-content select-all sm:text-lg"
    >
      {code}
    </code>

    <div class="flex flex-wrap gap-2">
      <Button severity="secondary" onClick={copy}>
        {copied ? $t("security.recovery.copied") : $t("security.recovery.copy")}
      </Button>
      <Button severity="secondary" onClick={download}>
        {$t("security.recovery.download")}
      </Button>
    </div>

    <Checkbox class="items-start" bind:checked={acknowledged} label={$t("security.recovery.confirmLabel")} />
  </div>

  {#snippet footer()}

      <Button disabled={!acknowledged} onClick={onConfirm}>
        {$t("security.recovery.confirm")}
      </Button>

  {/snippet}
</Modal>
