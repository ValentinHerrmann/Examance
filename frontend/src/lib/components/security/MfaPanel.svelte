<script lang="ts">
  /**
   * Sign-in factors, as seen from an open session.
   *
   * Two things this panel exists to make visible, because neither is obvious
   * from the login screen:
   *
   *  - which factors are enrolled, and whether that satisfies the policy;
   *  - which of them can also *decrypt* this account's data. An authenticator
   *    cannot: its secret lives server-side and six digits carry no entropy to
   *    derive a key from. A teacher whose only key-capable factor disappears
   *    keeps their account and loses their exams, so it is worth saying.
   */
  import { onMount } from "svelte";
  import { Button, Card } from "$lib/components/ui";
  import { t, translate, type TranslationKey } from "$lib/i18n";
  import {
    disableTotp,
    fetchMfaStatus,
    regenerateBackupCodes,
    type FactorKind,
    type MfaStatus,
  } from "$lib/api/mfa";
  import BackupCodeList from "./BackupCodeList.svelte";
  import TotpEnrollDialog from "./TotpEnrollDialog.svelte";

  let status: MfaStatus | null = null;
  let errorMsg = "";
  let showEnroll = false;
  let freshBackupCodes: string[] | null = null;

  const FACTOR_LABEL = {
    password: "security.panel.factorPassword",
    totp: "security.panel.factorTotp",
    passkey: "security.panel.factorPasskey",
  } as const satisfies Record<FactorKind, TranslationKey>;

  async function load() {
    errorMsg = "";
    try {
      status = await fetchMfaStatus();
    } catch {
      errorMsg = $t("security.panel.loadFailed");
    }
  }

  onMount(load);

  async function handleEnrolled(codes: string[]) {
    showEnroll = false;
    freshBackupCodes = codes;
    await load();
  }

  async function handleRegenerate() {
    errorMsg = "";
    try {
      freshBackupCodes = await regenerateBackupCodes();
      await load();
    } catch {
      errorMsg = $t("security.panel.loadFailed");
    }
  }

  async function handleRemoveTotp() {
    errorMsg = "";
    try {
      await disableTotp();
      await load();
    } catch {
      // The server refuses when this is the last factor keeping the account
      // usable. That guard is the reason "any two of three" is safe to offer.
      errorMsg = $t("security.panel.removeBlocked");
    }
  }

  $: keyCapableLabels = (status?.key_capable ?? [])
    .map((f) => translate(FACTOR_LABEL[f]))
    .join(", ");
</script>

<Card>
  <div class="flex flex-col gap-4">
    <div>
      <h2 class="m-0 text-lg font-semibold text-accent">{$t("security.panel.title")}</h2>
      <p class="mt-1 text-sm text-muted">{$t("security.panel.subtitle")}</p>
    </div>

    {#if errorMsg}
      <p class="m-0 text-sm text-red-400" role="alert">{errorMsg}</p>
    {/if}

    {#if status}
      <div>
        <p class="m-0 text-sm font-medium text-muted">{$t("security.panel.enrolled")}</p>
        <ul class="m-0 mt-1 flex list-none flex-wrap gap-2 p-0">
          {#each status.enrolled as factor (factor)}
            <li class="rounded-md bg-surface-inset px-2 py-1 text-sm text-content">
              {$t(FACTOR_LABEL[factor])}
            </li>
          {/each}
        </ul>
      </div>

      <p class="m-0 text-sm text-muted">
        {status.complete
          ? $t("security.panel.policyOk", { count: status.required_factor_count })
          : $t("security.panel.policyIncomplete", { count: status.required_factor_count })}
      </p>

      <p class="m-0 text-sm text-muted">
        {status.key_capable.length > 0
          ? $t("security.panel.keyCapableHint", { list: keyCapableLabels })
          : $t("security.panel.keyCapableNone")}
      </p>

      {#if status.enrolled.includes("totp")}
        <p class="m-0 text-sm text-muted">
          {$t("security.backupCodes.remaining", { count: status.remaining_backup_codes })}
        </p>
      {/if}

      <div class="flex flex-wrap gap-2">
        {#if status.enrolled.includes("totp")}
          <Button variant="secondary" onClick={handleRegenerate}>
            {$t("security.backupCodes.regenerate")}
          </Button>
          <Button variant="danger" onClick={handleRemoveTotp}>
            {$t("security.panel.removeTotp")}
          </Button>
        {:else}
          <Button onClick={() => (showEnroll = true)}>
            {$t("security.panel.addTotp")}
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</Card>

{#if showEnroll}
  <TotpEnrollDialog onEnrolled={handleEnrolled} />
{/if}

{#if freshBackupCodes}
  <BackupCodeList codes={freshBackupCodes} onConfirm={() => (freshBackupCodes = null)} />
{/if}
