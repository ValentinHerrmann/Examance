<script lang="ts">
  /** The single "write this down" screen after sign-in: backup codes and recovery code shown together, each labelled for its purpose, acknowledged once. Either half may be absent. */
  import { Alert, Button, Checkbox, Modal } from "#lib/components/ui";
  import { t } from "#lib/i18n";

  interface Props {
    backupCodes?: string[] | null;
    recoveryCode?: string | null;
    onConfirm: () => void;
  }

  let { backupCodes = null, recoveryCode = null, onConfirm }: Props = $props();

  let acknowledged = $state(false);
  let copied = $state(false);

  async function copyRecovery() {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be refused outright (permissions, insecure
      // context). The code is on screen either way, so this is not an error
      // worth interrupting anyone over.
    }
  }

  function download() {
    const parts: string[] = [];
    if (backupCodes?.length) {
      parts.push($t("security.setupCodes.backupHeading"), ...backupCodes, "");
    }
    if (recoveryCode) {
      parts.push($t("security.setupCodes.recoveryHeading"), recoveryCode, "");
    }
    const blob = new Blob([`${parts.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = $t("security.setupCodes.fileName");
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<Modal
  open={true}
  size="medium"
  title={$t("security.setupCodes.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <div class="flex flex-col gap-6">
    <p class="text-sm text-muted">{$t("security.setupCodes.intro")}</p>

    {#if backupCodes?.length}
      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold text-content">
          {$t("security.setupCodes.backupHeading")}
        </h3>
        <p class="m-0 text-sm text-muted">{$t("security.setupCodes.backupPurpose")}</p>
        <ul class="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {#each backupCodes as code (code)}
            <li
              class="rounded-md bg-surface-inset px-3 py-2 text-center font-mono text-sm
                     tracking-widest text-content select-all"
            >
              {code}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if recoveryCode}
      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold text-content">
          {$t("security.setupCodes.recoveryHeading")}
        </h3>
        <p class="m-0 text-sm text-muted">{$t("security.setupCodes.recoveryPurpose")}</p>
        <code
          class="block overflow-x-auto rounded-md bg-surface-inset p-4 text-center font-mono
                 text-base tracking-widest text-content select-all sm:text-lg"
        >
          {recoveryCode}
        </code>
        <div>
          <Button severity="secondary" onClick={copyRecovery}>
            {copied ? $t("security.recovery.copied") : $t("security.recovery.copy")}
          </Button>
        </div>
      </section>
    {/if}

    <Alert severity="warning">{$t("security.setupCodes.warning")}</Alert>

    <div>
      <Button severity="secondary" onClick={download}>
        {$t("security.setupCodes.download")}
      </Button>
    </div>

    <Checkbox class="items-start" bind:checked={acknowledged} label={$t("security.setupCodes.confirmLabel")} />
  </div>

  {#snippet footer()}

      <Button disabled={!acknowledged} onClick={onConfirm}>
        {$t("security.setupCodes.done")}
      </Button>

  {/snippet}
</Modal>
