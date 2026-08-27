<script lang="ts">
  /**
   * The one "write this down" screen at the end of a sign-in.
   *
   * Backup codes and the recovery code are minted at different moments —
   * the codes when the authenticator is confirmed, the recovery code when the
   * key envelope is created — and used to be shown in two consecutive dialogs
   * that looked identical. Teachers read the second one as "more backup codes
   * in another format", which is a reasonable reading of two unlabelled grids
   * of random characters.
   *
   * They are shown together here, each said to be for what it is actually for,
   * and acknowledged once. Either half may be absent: a sign-in that only
   * created the envelope has no backup codes to show, and vice versa.
   */
  import { Button, Modal } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  export let backupCodes: string[] | null = null;
  export let recoveryCode: string | null = null;
  export let onConfirm: () => void;

  let acknowledged = false;
  let copied = false;

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
  size="md"
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
          class="block overflow-x-auto rounded-lg bg-surface-inset p-4 text-center font-mono
                 text-base tracking-widest text-content select-all sm:text-lg"
        >
          {recoveryCode}
        </code>
        <div>
          <Button variant="secondary" onClick={copyRecovery}>
            {copied ? $t("security.recovery.copied") : $t("security.recovery.copy")}
          </Button>
        </div>
      </section>
    {/if}

    <p
      class="rounded-lg border border-line-strong bg-surface-sunken p-3 text-sm text-content"
      role="alert"
    >
      {$t("security.setupCodes.warning")}
    </p>

    <div>
      <Button variant="secondary" onClick={download}>
        {$t("security.setupCodes.download")}
      </Button>
    </div>

    <label class="flex items-start gap-2 text-sm text-content">
      <input type="checkbox" bind:checked={acknowledged} class="mt-1" />
      <span>{$t("security.setupCodes.confirmLabel")}</span>
    </label>
  </div>

  <svelte:fragment slot="footer">
    <Button disabled={!acknowledged} onClick={onConfirm}>
      {$t("security.setupCodes.done")}
    </Button>
  </svelte:fragment>
</Modal>
