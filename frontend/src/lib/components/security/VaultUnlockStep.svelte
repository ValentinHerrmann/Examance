<script lang="ts">
  /**
   * Signed in, but nothing presented can open the encrypted data.
   *
   * A passkey whose authenticator lacks the PRF extension authenticates and
   * nothing more, so a passkey sign-in (alone or with the authenticator) proves
   * who you are and yields no key material at all. The old code fell through to unwrapping
   * with an empty password, which threw, and the failure surfaced as "that code
   * is not valid" about a code that was correct.
   *
   * Both ways out are offered here. Neither re-wraps anything: the stored wraps
   * are fine, what is missing is a secret to open one with.
   */
  import { Button, Field, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { Argon2UnavailableError } from "$lib/crypto/keyDerivation";
  import { EnvelopeFactorMissingError } from "$lib/services/keyEnvelopeService";

  export let onPassword: (password: string) => Promise<void>;
  export let onRecoveryCode: (code: string) => Promise<void>;
  /**
   * The passkey has PRF but no usable wrap yet. Opening the vault once writes
   * one, so the intro can promise the passkey will suffice next time.
   */
  export let passkeyCanHeal = false;

  let useRecovery = false;
  let value = "";
  let errorMsg = "";
  let isWorking = false;

  async function submit() {
    if (!value.trim() || isWorking) {
      return;
    }
    isWorking = true;
    errorMsg = "";
    try {
      await (useRecovery ? onRecoveryCode(value.trim()) : onPassword(value));
    } catch (err: unknown) {
      // A browser that cannot load Argon2 cannot open the wrap with any secret.
      // Saying the password is wrong would send the teacher hunting for a
      // problem that is not theirs.
      // No envelope to open at all: the account has never stored its key, and
      // only a password the server has checked may create that first copy.
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

<form class="flex w-full flex-col gap-4" on:submit|preventDefault={submit}>
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
