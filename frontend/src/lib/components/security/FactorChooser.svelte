<script lang="ts">
  import { untrack } from "svelte";
  /** Which factor to finish sign-in with. `available` is the server's list, never inferred here (account-profile disclosure); a passkey is preferred and auto-prompted. */
  import { Button } from "$lib/components/ui";
  import { t, type TranslationKey } from "$lib/i18n";
  import type { FactorKind } from "$lib/api/mfa";
  import PasswordFactor from "./PasswordFactor.svelte";
  import TotpFactor from "./TotpFactor.svelte";

  interface Props {
    /** Straight from the server's `available`, minus anything the caller cannot offer. */
    available: FactorKind[];
    onTotp: (code: string, useBackupCode: boolean) => Promise<void>;
    onPassword: (password: string) => Promise<void>;
    onPasskey: () => Promise<void>;
    errorMsg?: string;
    /** The page's automatic passkey prompt is open. */
    passkeyPending?: boolean;
  }

  let {
    available,
    onTotp,
    onPassword,
    onPasskey,
    errorMsg = "",
    passkeyPending = false
  }: Props = $props();

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

  let chosen: FactorKind | null = $state(null);
  let isWorking = $state(false);

  let canGoBack = $derived(available.length > 1);

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

  // With exactly two factors enrolled there is only ever one left to present,
  // and a menu of one is worse than no menu.
  $effect.pre(() => {
    const factors = available;
    const current = chosen;
    if (factors.length === 1 && current === null) {
      untrack(() => {
        chosen = factors[0];
      });
    }
  });
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
