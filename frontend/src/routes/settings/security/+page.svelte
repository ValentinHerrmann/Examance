<script lang="ts">
  /**
   * Sign-in and security, on its own page.
   *
   * Everything that decides whether this account can be reached and whether its
   * data can be read, in one place and in one load. The two panels this replaces
   * sat halfway down the settings page and each fetched its own state, so
   * registering a passkey left the factor list next to it describing the account
   * as it had been a moment earlier.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { t } from "$lib/i18n";
  import { isAuthenticated, isUnlocked, sessionStore } from "$lib/stores/session";
  import { Button, PageHeader, PageShell } from "$lib/components/ui";
  import { fetchMfaStatus, type MfaStatus } from "$lib/api/mfa";
  import { listPasskeys, type PasskeySummary } from "$lib/api/webauthn";
  import {
    FactorSummary,
    PasskeyManager,
    PasswordFactorCard,
    RecoveryFactorCard,
    TotpFactorCard,
  } from "$lib/components/security";

  let status: MfaStatus | null = null;
  let passkeys: PasskeySummary[] = [];
  let errorMsg = "";
  let isLoading = true;

  /**
   * One load for the whole page.
   *
   * Every card calls this after it changes anything, so the summary, the factor
   * list and the passkey list can never disagree about what the account has.
   */
  async function load() {
    errorMsg = "";
    try {
      const [nextStatus, nextPasskeys] = await Promise.all([fetchMfaStatus(), listPasskeys()]);
      status = nextStatus;
      passkeys = nextPasskeys;
    } catch {
      errorMsg = $t("security.panel.loadFailed");
    } finally {
      isLoading = false;
    }
  }

  onMount(load);
</script>

{#if $isUnlocked}
  <PageShell>
    <PageHeader title={$t("security.page.title")} helpTopic="security" />

    <p class="mt-0 mb-6 text-sm text-muted">{$t("security.page.subtitle")}</p>

    {#if !$isAuthenticated}
      <!-- A local vault has no sign-in factors: there is no account to protect. -->
      <p class="text-sm text-muted">{$t("security.page.localOnly")}</p>
    {:else if isLoading}
      <p class="text-sm text-muted">{$t("security.page.loading")}</p>
    {:else if errorMsg}
      <p class="text-sm text-red-400" role="alert">{errorMsg}</p>
    {:else if status && $sessionStore.teacherId}
      <div class="mb-8 flex flex-col gap-6">
        <FactorSummary {status} />
        <PasswordFactorCard {status} teacherId={$sessionStore.teacherId} onChanged={load} />
        <TotpFactorCard {status} onChanged={load} />
        <PasskeyManager teacherId={$sessionStore.teacherId} {passkeys} onChanged={load} />
        <RecoveryFactorCard {status} teacherId={$sessionStore.teacherId} onChanged={load} />
      </div>
    {/if}

    <Button variant="secondary" onClick={() => goto("/settings")}>
      {$t("security.page.backToSettings")}
    </Button>
  </PageShell>
{/if}
