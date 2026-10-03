<script lang="ts">
  /**
   * Which factor to finish the sign-in with.
   *
   * The policy takes any two of password, passkey and authenticator, and the
   * server has always said which ones an account can still present — every
   * step response carries `available`. The screen ignored it and rendered an
   * authenticator prompt regardless, so signing in with a passkey left no route
   * but the phone, and signing in with a password never offered the passkey.
   *
   * The list is the server's, never inferred here: asking the client to work
   * out what an account has would mean telling it, which is the account-profile
   * disclosure the whole flow is built to avoid.
   *
   * A passkey is the preferred second factor: the page sorts it first and
   * starts its prompt by itself. While that prompt is open the buttons wait;
   * cancelling it lands here, with every factor still on offer.
   */
  import { Button } from "$lib/components/ui";
  import { t, type TranslationKey } from "$lib/i18n";
  import type { FactorKind } from "$lib/api/mfa";
  import PasswordFactor from "./PasswordFactor.svelte";
  import TotpFactor from "./TotpFactor.svelte";

  /** Straight from the server's `available`, minus anything the caller cannot offer. */
  export let available: FactorKind[];
  export let onTotp: (code: string, useBackupCode: boolean) => Promise<void>;
  export let onPassword: (password: string) => Promise<void>;
  export let onPasskey: () => Promise<void>;
  export let errorMsg = "";
  /** The page's automatic passkey prompt is open. */
  export let passkeyPending = false;

  const LABEL = {
    password: "security.panel.factorPassword",
    totp: "security.panel.factorTotp",
    passkey: "security.panel.factorPasskey",
  } as const satisfies Record<FactorKind, TranslationKey>;

  const HINT = {
    password: "security.chooser.passwordHint",
    totp: "security.chooser.totpHint",
    passkey: "security.chooser.passkeyHint",
  } as const satisfies Record<FactorKind, TranslationKey>;

  let chosen: FactorKind | null = null;
  let isWorking = false;

  // With exactly two factors enrolled there is only ever one left to present,
  // and a menu of one is worse than no menu.
  $: if (available.length === 1 && chosen === null) {
    chosen = available[0];
  }
  $: canGoBack = available.length > 1;

  async function choose(factor: FactorKind) {
    errorMsg = "";
    if (factor !== "passkey") {
      chosen = factor;
      return;
    }
    // The passkey has no form of its own — choosing it *is* the ceremony.
    isWorking = true;
    try {
      await onPasskey();
    } finally {
      isWorking = false;
    }
  }

  function back() {
    chosen = null;
    errorMsg = "";
  }
</script>

{#if chosen === "totp"}
  <TotpFactor onSubmit={onTotp} {errorMsg} />
{:else if chosen === "password"}
  <PasswordFactor onSubmit={onPassword} {errorMsg} />
{:else}
  <div class="flex w-full flex-col gap-4">
    <div>
      <h2 class="m-0 text-xl font-medium text-content">
        {$t("security.factors.chooserTitle")}
      </h2>
      <p class="mt-1 text-sm text-muted">{$t("security.factors.chooserIntro")}</p>
    </div>

    {#if passkeyPending}
      <p class="m-0 text-sm text-muted" role="status">{$t("security.chooser.passkeyWaiting")}</p>
    {/if}

    {#if errorMsg}
      <p class="m-0 text-sm text-danger-fg" role="alert">{errorMsg}</p>
    {/if}

    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      {#each available as factor (factor)}
        <li>
          <Button
            variant="outlined"
            severity="secondary"
            block
            class="h-auto justify-start! py-3! text-left whitespace-normal!"
            disabled={isWorking || passkeyPending}
            onClick={() => choose(factor)}
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-content">{$t(LABEL[factor])}</span>
              <span class="mt-0.5 block text-xs text-muted">{$t(HINT[factor])}</span>
            </span>
          </Button>
        </li>
      {/each}
    </ul>
  </div>
{/if}

{#if chosen !== null && canGoBack}
  <div class="mt-4">
    <Button variant="text" severity="secondary" size="sm" onClick={back}>
      {$t("security.chooser.back")}
    </Button>
  </div>
{/if}
