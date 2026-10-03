<script lang="ts">
  /** Signed in, but nothing presented can open the data (e.g. a passkey without PRF proves identity, yields no key). Offers password or recovery code; neither re-wraps anything. */
  import { Button, Field, TextInput } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { Argon2UnavailableError } from "#lib/crypto/keyDerivation";
  import { EnvelopeFactorMissingError } from "#lib/services/keyEnvelopeService";

  interface Props {
    onPassword: (password: string) => Promise<void>;
    onRecoveryCode: (code: string) => Promise<void>;
    /** Passkey has PRF but no usable wrap yet; opening the vault once writes one. */
    passkeyCanHeal?: boolean;
  }

  let { onPassword, onRecoveryCode, passkeyCanHeal = false }: Props = $props();

  let useRecovery = $state(false);
  let value = $state("");
  let errorMsg = $state("");
  let isWorking = $state(false);

  async function submit() {
    if (!value.trim() || isWorking) {
      return;
    }
    isWorking = true;
    errorMsg = "";
    try {
      await (useRecovery ? onRecoveryCode(value.trim()) : onPassword(value));
    } catch (err: unknown) {
      // No Argon2 in this browser: not a wrong password. Missing envelope: only a server-checked password may create the first copy.
      errorMsg =
        err instanceof Argon2UnavailableError
          ? $t("security.vaultUnlock.kdfUnavailable")
          : err instanceof EnvelopeFactorMissingError
            ? $t("security.vaultUnlock.needsPasswordSignIn")
          : useRecovery
            ? $t("security.vaultUnlock.wrongRecovery")
            : $t("security.vaultUnlock.wrongPassword");
    } finally {
      isWorking = false;
    }
  }

  function toggle() {
    useRecovery = !useRecovery;
    value = "";
    errorMsg = "";
  }
</script>

<form class="flex w-full flex-col gap-4" onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <div>
    <h2 class="m-0 text-xl font-medium text-content">{$t("security.vaultUnlock.title")}</h2>
    <p class="mt-1 text-sm text-muted">
      {useRecovery
        ? $t("security.vaultUnlock.recoveryIntro")
        : passkeyCanHeal
          ? $t("security.vaultUnlock.passwordIntroHeal")
          : $t("security.vaultUnlock.passwordIntro")}
    </p>
  </div>

  <Field
    label={useRecovery
      ? $t("security.unlock.label")
      : $t("security.panel.factorPassword")}
    error={errorMsg}
  >
    {#if useRecovery}
      <TextInput
        bind:value
        placeholder={$t("security.unlock.placeholder")}
        class="font-mono"
      />
    {:else}
      <TextInput type="password" bind:value />
    {/if}
  </Field>

  <Button type="submit" block disabled={isWorking || !value.trim()} loading={isWorking}>
    {isWorking ? $t("security.factors.checking") : $t("security.vaultUnlock.submit")}
  </Button>

  <Button variant="text" size="sm" onClick={toggle}>
    {useRecovery
      ? $t("security.vaultUnlock.usePassword")
      : $t("security.vaultUnlock.useRecovery")}
  </Button>
</form>
