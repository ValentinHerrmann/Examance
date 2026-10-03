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
  import { t } from "#lib/i18n";
  import { isAuthenticated, isUnlocked, sessionStore } from "#lib/stores/session";
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Button, PageHeader, PageShell } from "#lib/components/ui";
  import SectionNav from "#lib/components/settings/SectionNav.svelte";
  import { fetchMfaStatus, type MfaStatus } from "#lib/api/mfa";
  import { listPasskeys, type PasskeySummary } from "#lib/api/webauthn";
  import {
    FactorSummary,
    PasskeyManager,
    PasswordFactorCard,
    RecoveryFactorCard,
    TotpFactorCard,
  } from "#lib/components/security";

  let status: MfaStatus | null = $state.raw(null);
  let passkeys: PasskeySummary[] = $state.raw([]);
  let errorMsg = $state("");
  let isLoading = $state(true);

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

  let navItems = $derived([
    { id: "summary", label: $t("security.panel.enrolled") },
    { id: "password", label: $t("security.panel.factorPassword") },
    { id: "totp", label: $t("security.panel.factorTotp") },
    { id: "passkeys", label: $t("security.passkey.title") },
    { id: "recovery", label: $t("security.recovery.title") },
  ]);

  onMount(load);
</script>

{#if $isUnlocked}
  <PageShell width="wide">
    <PageHeader
      title={$t("security.page.title")}
      subtitle={$t("security.page.subtitle")}
      helpTopic="security"
    />

    {#if !$isAuthenticated}
      <!-- A local vault has no sign-in factors: there is no account to protect. -->
      <p class="text-sm text-muted">{$t("security.page.localOnly")}</p>
    {:else if isLoading}
      <p class="text-sm text-muted">{$t("security.page.loading")}</p>
    {:else if errorMsg}
      <Alert severity="danger">{errorMsg}</Alert>
    {:else if status && $sessionStore.teacherId}
      <div class="lg:flex lg:items-start lg:gap-8">
        <SectionNav items={navItems} ariaLabel={$t("security.page.title")} />

        <div class="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
          <div id="summary" class="scroll-mt-16 lg:scroll-mt-4">
            <FactorSummary {status} />
          </div>
          <div id="password" class="scroll-mt-16 lg:scroll-mt-4">
            <PasswordFactorCard {status} teacherId={$sessionStore.teacherId} onChanged={load} />
          </div>
          <div id="totp" class="scroll-mt-16 lg:scroll-mt-4">
            <TotpFactorCard {status} onChanged={load} />
          </div>
          <div id="passkeys" class="scroll-mt-16 lg:scroll-mt-4">
            <PasskeyManager teacherId={$sessionStore.teacherId} {passkeys} onChanged={load} />
          </div>
          <div id="recovery" class="scroll-mt-16 lg:scroll-mt-4">
            <RecoveryFactorCard {status} teacherId={$sessionStore.teacherId} onChanged={load} />
          </div>
        </div>
      </div>
    {/if}

    <div class="mt-6">
      <Button variant="outlined" severity="secondary" icon={faArrowLeft} onClick={() => goto("/settings")}>
        {$t("security.page.backToSettings")}
      </Button>
    </div>
  </PageShell>
{/if}
