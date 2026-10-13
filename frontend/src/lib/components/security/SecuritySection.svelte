<script lang="ts">
  /**
   * Sign-in and security cards, loaded once: every card reloads the whole set after a change, so the
   * summary, factor list and passkey list can never disagree about what the account has.
   */
  import { onMount } from "svelte";
  import { t } from "#lib/i18n";
  import { sessionStore } from "#lib/stores/session";
  import { Alert } from "#lib/components/ui";
  import { fetchMfaStatus, type MfaStatus } from "#lib/api/mfa";
  import { listPasskeys, type PasskeySummary } from "#lib/api/webauthn";
  import FactorSummary from "./FactorSummary.svelte";
  import PasskeyManager from "./PasskeyManager.svelte";
  import PasswordFactorCard from "./PasswordFactorCard.svelte";
  import RecoveryFactorCard from "./RecoveryFactorCard.svelte";
  import TotpFactorCard from "./TotpFactorCard.svelte";

  let status: MfaStatus | null = $state.raw(null);
  let passkeys: PasskeySummary[] = $state.raw([]);
  let errorMsg = $state("");
  let isLoading = $state(true);

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

<div id="security" class="flex scroll-mt-16 flex-col gap-4 lg:scroll-mt-4">
  {#if isLoading}
    <p class="m-0 text-sm text-muted">{$t("security.page.loading")}</p>
  {:else if errorMsg}
    <Alert severity="danger">{errorMsg}</Alert>
  {:else if status && $sessionStore.teacherId}
    <FactorSummary {status} />
    <PasswordFactorCard {status} teacherId={$sessionStore.teacherId} onChanged={load} />
    <TotpFactorCard {status} onChanged={load} />
    <PasskeyManager teacherId={$sessionStore.teacherId} {passkeys} onChanged={load} />
    <RecoveryFactorCard {status} teacherId={$sessionStore.teacherId} onChanged={load} />
  {/if}
</div>
