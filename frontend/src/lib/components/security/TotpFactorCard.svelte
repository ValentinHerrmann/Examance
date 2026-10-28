<script lang="ts">
  import FactorCard from "./FactorCard.svelte";
  /** The authenticator app with its backup codes. Backup codes live here because they are the authenticator's stand-in, not a separate factor. */
  import { Button } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { ApiError } from "#lib/api/client";
  import { disableTotp, regenerateBackupCodes, type MfaStatus } from "#lib/api/mfa";
  import SetupCodesDialog from "./SetupCodesDialog.svelte";
  import FactorMeta from "./FactorMeta.svelte";
  import TotpEnrollDialog from "./TotpEnrollDialog.svelte";

  interface Props {
    status: MfaStatus;
    onChanged: () => void;
  }

  let { status, onChanged }: Props = $props();

  /** Below this, a lost phone is close to a lockout. */
  const LOW_WATERMARK = 3;

  let errorMsg = $state("");
  let showEnroll = $state(false);
  let freshCodes: string[] | null = $state.raw(null);
  let isWorking = $state(false);

  let enrolled = $derived(status.enrolled.includes("totp"));
  let codesLow = $derived(status.remaining_backup_codes <= LOW_WATERMARK);

  async function handleEnrolled(codes: string[]) {
    showEnroll = false;
    freshCodes = codes;
    onChanged();
  }

  async function regenerate() {
    errorMsg = "";
    isWorking = true;
    try {
      freshCodes = await regenerateBackupCodes();
      onChanged();
    } catch {
      errorMsg = $t("security.panel.loadFailed");
    } finally {
      isWorking = false;
    }
  }

  async function remove() {
    errorMsg = "";
    isWorking = true;
    try {
      await disableTotp();
      onChanged();
    } catch (err: unknown) {
      // The server refuses when this is the last factor keeping the account
      // usable, and says which rule it hit. That reason is more useful than
      // anything this component could word for itself.
      errorMsg =
        err instanceof ApiError && err.code === "ERR_LAST_FACTOR_PROTECTED"
          ? err.message
          : $t("security.panel.loadFailed");
    } finally {
      isWorking = false;
    }
  }
</script>

<FactorCard title={$t("security.panel.factorTotp")} {enrolled}>

  {#if errorMsg}
    <p class="m-0 text-sm text-danger-fg" role="alert">{errorMsg}</p>
  {/if}

  {#if enrolled}
    <FactorMeta createdAt={status.totp_created_at} lastUsedAt={status.totp_last_used_at} />

    <p class="m-0 text-sm text-muted">{$t("security.page.opensDataNot")}</p>

    <div class="flex flex-col gap-1">
      <p class="m-0 text-sm" class:text-muted={!codesLow} class:text-content={codesLow}>
        {$t("security.backupCodes.remaining", { count: status.remaining_backup_codes })}
      </p>
      {#if codesLow}
        <p class="m-0 text-xs text-muted">{$t("security.page.backupCodesLow")}</p>
      {/if}
    </div>

    <div class="flex flex-wrap gap-2">
      <Button severity="secondary" disabled={isWorking} onClick={regenerate}>
        {$t("security.backupCodes.regenerate")}
      </Button>
      <Button severity="danger" disabled={isWorking} onClick={remove}>
        {$t("security.panel.removeTotp")}
      </Button>
    </div>
  {:else}
    <p class="m-0 text-sm text-muted">{$t("security.page.totpMissing")}</p>
    <div>
      <Button onClick={() => (showEnroll = true)}>{$t("security.panel.addTotp")}</Button>
    </div>
  {/if}
</FactorCard>

{#if showEnroll}
  <TotpEnrollDialog onEnrolled={handleEnrolled} />
{/if}

{#if freshCodes}
  <SetupCodesDialog backupCodes={freshCodes} onConfirm={() => (freshCodes = null)} />
{/if}
