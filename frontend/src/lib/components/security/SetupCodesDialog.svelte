<script lang="ts">
  /**
   * The one "write this down" screen: backup codes, the recovery code, or both after sign-in (each then
   * labelled for its purpose). Shown once, never dismissable by backdrop/Escape, confirmed by an acknowledgement.
   */
  import { Alert, Button, Checkbox, Modal } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { t } from "#lib/i18n";

  interface Props {
    backupCodes?: string[] | null;
    recoveryCode?: string | null;
    onConfirm: () => void;
  }

  let { backupCodes = null, recoveryCode = null, onConfirm }: Props = $props();

  let both = $derived(!!backupCodes?.length && !!recoveryCode);
  let prefix = $derived(
    both ? "security.setupCodes" : backupCodes?.length ? "security.backupCodes" : "security.recovery"
  ) as "security.setupCodes" | "security.backupCodes" | "security.recovery";
  let acknowledged = $state(false);
  let copied = $state(false);

  async function copyRecovery() {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be refused (permissions, insecure context); the code is on screen either way.
    }
  }

  function download() {
    // Headings only when both halves share the file.
    const parts = both
      ? [$t("security.setupCodes.backupHeading"), ...backupCodes!, "", $t("security.setupCodes.recoveryHeading"), recoveryCode!, ""]
      : [...(backupCodes ?? []), ...(recoveryCode ? [recoveryCode] : [])];
    downloadBlob(new Blob([`${parts.join("\n")}\n`], { type: "text/plain" }), $t(`${prefix}.fileName`));
  }
</script>

<Modal open={true} size="medium" title={$t(`${prefix}.title`)} closeOnBackdrop={false} closeOnEscape={false}>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">{$t(`${prefix}.intro`)}</p>
    <Alert severity="warning">{$t(`${prefix}.warning`)}</Alert>

    {#if backupCodes?.length}
      <section class="flex flex-col gap-2">
        {#if both}
          <h3 class="m-0 text-sm font-semibold text-content">{$t("security.setupCodes.backupHeading")}</h3>
          <p class="m-0 text-sm text-muted">{$t("security.setupCodes.backupPurpose")}</p>
        {/if}
        <ul class="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {#each backupCodes as code (code)}
            <li class="rounded-md bg-surface-inset px-3 py-2 text-center font-mono text-sm tracking-widest text-content select-all">
              {code}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if recoveryCode}
      <section class="flex flex-col gap-2">
        {#if both}
          <h3 class="m-0 text-sm font-semibold text-content">{$t("security.setupCodes.recoveryHeading")}</h3>
          <p class="m-0 text-sm text-muted">{$t("security.setupCodes.recoveryPurpose")}</p>
        {/if}
        <code
          class="block overflow-x-auto rounded-md bg-surface-inset p-4 text-center font-mono text-base tracking-widest text-content select-all sm:text-lg"
        >
          {recoveryCode}
        </code>
      </section>
    {/if}

    <div class="flex flex-wrap gap-2">
      {#if recoveryCode}
        <Button severity="secondary" onClick={copyRecovery}>
          {copied ? $t("security.recovery.copied") : $t("security.recovery.copy")}
        </Button>
      {/if}
      <Button severity="secondary" onClick={download}>{$t(`${prefix}.download`)}</Button>
    </div>

    <Checkbox class="items-start" bind:checked={acknowledged} label={$t(`${prefix}.confirmLabel`)} />
  </div>

  {#snippet footer()}
    <Button disabled={!acknowledged} onClick={onConfirm}>
      {prefix === "security.recovery" ? $t("security.recovery.confirm") : $t(`${prefix}.done`)}
    </Button>
  {/snippet}
</Modal>
