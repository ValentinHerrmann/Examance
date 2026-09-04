<script lang="ts">
  /**
   * The recovery code — not a sign-in factor, the last way back to the data.
   *
   * It is on this page because that is where teachers look for it, and because
   * until now nothing in the app said whether one existed. The code itself is
   * unrecoverable: the server holds a wrap it cannot open, so all that can be
   * offered is a replacement, minted from the open vault.
   */
  import { Button, Card } from "$lib/components/ui";
  import { Argon2UnavailableError } from "$lib/crypto/keyDerivation";
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
  import type { MfaStatus } from "$lib/api/mfa";
  import { regenerateRecoveryCode, vaultFromSession } from "$lib/services/keyEnvelopeService";
  import RecoveryCodeDialog from "./RecoveryCodeDialog.svelte";

  export let status: MfaStatus;
  export let teacherId: string;
  export let onChanged: () => void;

  let errorMsg = "";
  let isWorking = false;
  let freshCode: string | null = null;

  async function regenerate() {
    errorMsg = "";
    const vault = vaultFromSession();
    if (!vault) {
      errorMsg = $t("security.password.needsUnlock");
      return;
    }

    isWorking = true;
    try {
      freshCode = await regenerateRecoveryCode(teacherId, vault);
      onChanged();
    } catch (err: unknown) {
      errorMsg =
        err instanceof Argon2UnavailableError
          ? $t("security.vaultUnlock.kdfUnavailable")
          : $t("security.recovery.regenerateFailed");
    } finally {
      isWorking = false;
    }
  }
</script>

<Card tone={status.has_recovery_code ? "default" : "warning"}>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="m-0 text-lg font-semibold text-accent">{$t("security.recovery.title")}</h2>
      <span class="text-sm text-muted">
        {status.has_recovery_code
          ? $t("security.page.statusEnrolled")
          : $t("security.page.statusMissing")}
      </span>
    </div>

    <p class="m-0 text-sm text-muted">{$t("security.recovery.intro")}</p>

    {#if status.has_recovery_code}
      <p class="m-0 text-xs text-subtle">
        {status.recovery_created_at
          ? $t("security.page.added", { date: $fmt.date(new Date(status.recovery_created_at)) })
          : $t("security.page.addedUnknown")}
      </p>
    {:else}
      <p
        class="m-0 rounded-lg border border-line-strong bg-surface-sunken p-3 text-sm text-content"
        role="alert"
      >
        {$t("security.page.recoveryMissing")}
      </p>
    {/if}

    {#if errorMsg}
      <p class="m-0 text-sm text-red-400" role="alert">{errorMsg}</p>
    {/if}

    <p class="m-0 text-xs text-subtle">{$t("security.recovery.regenerateHint")}</p>

    <div>
      <Button variant="secondary" disabled={isWorking} loading={isWorking} onClick={regenerate}>
        {$t("security.recovery.regenerate")}
      </Button>
    </div>
  </div>
</Card>

{#if freshCode}
  <RecoveryCodeDialog code={freshCode} onConfirm={() => (freshCode = null)} />
{/if}
