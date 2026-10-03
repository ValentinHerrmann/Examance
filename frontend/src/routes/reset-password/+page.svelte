<script lang="ts">
  // Password reset wizard. Needs a second factor (mailbox alone must not take over an account); the data key is
  // unwrapped in the browser with the recovery code and re-wrapped under the new password, sent in one request.
  import { onMount } from "svelte";
  import { api, ApiError } from "#lib/api/client";
  import { t, translate } from "#lib/i18n";
  import { startReset, submitBackupCode, submitTotp, type AuthStep } from "#lib/api/mfa";
  import { loginOptions, verifyLogin } from "#lib/api/webauthn";
  import { authenticate, isSupported as passkeysSupported } from "#lib/webauthn/client";
  import { envelopeSetToDto } from "#lib/api/keyEnvelopes";
  import {
    buildResetEnvelopeSet,
    openWithPasskey,
    openWithRecoveryCode,
    pinEnvelopeSet,
  } from "#lib/services/keyEnvelopeService";
  import { FactorChooser, RecoveryCodeDialog } from "#lib/components/security";
  import { Alert, Button, Card, Field, PageShell, TextInput } from "#lib/components/ui";

  type Stage = "password" | "factor" | "key";

  let token = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let isSubmitting = $state(false);
  let errorMsg = $state("");
  let successMsg = $state("");

  let stage: Stage = $state("password");
  let step = $state.raw<AuthStep | null>(null);
  let factorErrorMsg = $state("");
  let recoveryCode = $state("");
  let recoveryErrorMsg = $state("");
  let skipConfirmed = $state(false);
  /** A freshly minted recovery code, shown once after a successful reset. */
  let issuedRecoveryCode: string | null = $state(null);
  const canUsePasskeys = passkeysSupported();

  /** What the server offers as second factor, minus password and passkey where WebAuthn is unsupported. */
  let availableFactors = $derived(
    (step?.available ?? ["totp"]).filter((f) => f !== "password" && (f !== "passkey" || canUsePasskeys)),
  );
  /** A passkey that carried the second factor and yielded its PRF secret; it already recovered the data key, so the recovery-code step is skipped. */
  let passkeyUnwrap = $state.raw<{ credentialIdB64: string; prfOutput: Uint8Array } | null>(null);

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    token = urlParams.get("token") || "";
    if (!token) {
      errorMsg = translate("auth.resetPassword.errors.tokenMissingOnLoad");
    }
  });

  function validatePassword(): boolean {
    if (!token) {
      errorMsg = translate("auth.resetPassword.errors.tokenMissing");
      return false;
    }
    if (!newPassword) {
      errorMsg = translate("auth.resetPassword.errors.enterNewPassword");
      return false;
    }
    if (newPassword.length < 12) {
      errorMsg = translate("auth.resetPassword.errors.passwordTooShort");
      return false;
    }
    if (newPassword !== confirmPassword) {
      errorMsg = translate("auth.resetPassword.errors.passwordsDoNotMatch");
      return false;
    }
    return true;
  }

  /** Step one: choose the new password and open the reset with the emailed token. */
  async function handleResetPassword() {
    errorMsg = "";
    successMsg = "";
    if (!validatePassword()) {
      return;
    }

    isSubmitting = true;
    try {
      step = await startReset(token);
      // An account that never finished enrolling has no second factor to offer;
      // requiring one would strand it. It goes straight to key recovery.
      stage = step.status === "factor_required" ? "factor" : "key";
    } catch (err: unknown) {
      errorMsg = err instanceof ApiError ? err.message : translate("auth.resetPassword.errors.failed");
    } finally {
      isSubmitting = false;
    }
  }

  /** Step two: the second factor. */
  async function handleSecondFactor(code: string, useBackupCode: boolean) {
    factorErrorMsg = "";
    try {
      step = useBackupCode ? await submitBackupCode(code) : await submitTotp(code);
      if (step.status === "ok") {
        stage = "key";
      }
    } catch (err: unknown) {
      factorErrorMsg =
        err instanceof ApiError && err.code === "ERR_MFA_CODE_ALREADY_USED"
          ? translate("security.factors.alreadyUsed")
          : translate("security.factors.invalid");
    }
  }

  /** Second factor by passkey, which may also recover the key outright. */
  async function handlePasskeyFactor() {
    factorErrorMsg = "";
    try {
      const options = await loginOptions();
      const assertion = await authenticate(options);
      step = await verifyLogin({
        handle: options.handle,
        challenge_b64: options.challenge_b64,
        credential_json: assertion.credentialJson,
      });
      if (assertion.prfOutput) {
        const parsed = JSON.parse(assertion.credentialJson) as { rawId: string };
        passkeyUnwrap = { credentialIdB64: parsed.rawId, prfOutput: assertion.prfOutput };
      }
      if (step.status === "ok") {
        stage = "key";
        if (passkeyUnwrap) {
          // The passkey already holds a copy of the data key. Nothing else to ask for.
          await finishReset(true);
        }
      }
    } catch {
      factorErrorMsg = translate("security.passkey.failed");
    }
  }

  /** Step three: recover the data key and finish. The re-wrapped key goes with the new password in one request; skipping it leaves old data sealed. */
  async function finishReset(withRecovery: boolean) {
    recoveryErrorMsg = "";
    if (!step) {
      return;
    }
    isSubmitting = true;
    try {
      let envelopeDto: Record<string, unknown> | undefined;
      let mintedCode: string | null = null;
      let builtSet: Awaited<ReturnType<typeof buildResetEnvelopeSet>> | null = null;

      if (withRecovery) {
        const vault = passkeyUnwrap
          ? await openWithPasskey(step.id, passkeyUnwrap.credentialIdB64, passkeyUnwrap.prfOutput)
          : await openWithRecoveryCode(step.id, recoveryCode);
        builtSet = await buildResetEnvelopeSet(step.id, vault, newPassword);
        envelopeDto = envelopeSetToDto(builtSet.set);
        mintedCode = builtSet.recoveryCode;
      }

      const res = await api.post<{ message: string }>(
        "/auth/reset-password",
        { token, new_password: newPassword, envelope: envelopeDto ?? null },
        { silentError: true },
      );

      if (builtSet) {
        // The set was written by the reset request rather than by saveEnvelopes,
        // so pin it here: this browser built it and knows it is genuine.
        await pinEnvelopeSet(step.id, builtSet.set);
      }

      successMsg = res.message || translate("auth.resetPassword.defaultSuccess");
      newPassword = "";
      confirmPassword = "";
      recoveryCode = "";
      issuedRecoveryCode = mintedCode;
    } catch (err: unknown) {
      recoveryErrorMsg =
        err instanceof ApiError ? err.message : translate("auth.resetPassword.errors.failed");
    } finally {
      isSubmitting = false;
    }
  }
</script>

<PageShell width="form" center>
  <Card class="sm:p-8">
    <div class="mb-6 text-center">
      <img src="/favicon.png" alt="Examance logo" class="mx-auto mb-3 size-14 rounded-xl object-contain" />
      <h1 class="m-0 text-2xl font-normal text-content">{$t("auth.resetPassword.title")}</h1>
      <p class="mt-2 mb-0 text-sm leading-snug text-muted">{$t("auth.resetPassword.subtitle")}</p>
    </div>

    {#if successMsg}
      <Alert severity="success" class="mb-5">{successMsg}</Alert>
      <div class="mb-6 text-center">
        <Button href="/unlock">{$t("auth.resetPassword.proceedToSignIn")}</Button>
      </div>
    {:else if stage === "factor"}
      <h2 class="m-0 text-lg font-semibold text-content">{$t("security.reset.step2Title")}</h2>
      <p class="mt-1 mb-4 text-sm text-muted">{$t("security.reset.step2Intro")}</p>
      <!--
        The same chooser the sign-in screen uses, minus the password: a reset
        exists because the password is unavailable, and the emailed token
        already stands in for it.
      -->
      <FactorChooser
        available={availableFactors}
        onTotp={handleSecondFactor}
        onPassword={async () => {}}
        onPasskey={handlePasskeyFactor}
        errorMsg={factorErrorMsg}
      />
    {:else if stage === "key"}
      <h2 class="m-0 text-lg font-semibold text-content">{$t("security.reset.keyTitle")}</h2>
      {#if passkeyUnwrap}
        <p class="mt-1 mb-4 text-sm text-muted">{$t("security.reset.passkeyRecovered")}</p>
      {:else}
        <p class="mt-1 mb-4 text-sm text-muted">{$t("security.reset.keyIntro")}</p>
      {/if}

      <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); finishReset(true); }}>
        {#if !passkeyUnwrap}
          <Field label={$t("security.unlock.label")} error={recoveryErrorMsg}>
            <TextInput
              bind:value={recoveryCode}
              placeholder={$t("security.unlock.placeholder")}
              class="font-mono tracking-wider"
            />
        </Field>
        {:else if recoveryErrorMsg}
          <p class="m-0 text-sm text-danger-fg" role="alert">{recoveryErrorMsg}</p>
        {/if}

        <Button
          type="submit"
          block
          disabled={isSubmitting || (!passkeyUnwrap && !recoveryCode.trim())}
          loading={isSubmitting}
        >
          {isSubmitting ? $t("security.reset.working") : $t("security.unlock.submit")}
        </Button>
      </form>

      <div class="mt-4 flex flex-col gap-2">
        {#if skipConfirmed}
          <p class="m-0 text-sm text-content" role="alert">
            {$t("security.reset.keySkipWarning")}
          </p>
          <Button variant="solid" severity="danger" disabled={isSubmitting} onClick={() => finishReset(false)}>
            {$t("security.reset.keySkipConfirm")}
          </Button>
        {:else}
          <Button variant="text" size="sm" class="self-start" onClick={() => (skipConfirmed = true)}>
            {$t("security.reset.keySkip")}
          </Button>
        {/if}
      </div>
    {:else}
      {#if errorMsg}
        <Alert severity="danger" class="mb-5">{errorMsg}</Alert>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); handleResetPassword(); }} class="flex flex-col gap-5">
        <Field forId="newPassword" label={$t("auth.resetPassword.newPasswordLabel")}>
          {#snippet children({ id })}
            <TextInput
              {id}
              type="password"
              bind:value={newPassword}
              placeholder={$t("auth.resetPassword.newPasswordPlaceholder")}
              autocomplete="new-password"
              minlength={12}
              required
              disabled={isSubmitting || !token}
            />
          {/snippet}
        </Field>

        <Field forId="confirmPassword" label={$t("auth.resetPassword.confirmPasswordLabel")}>
          {#snippet children({ id })}
            <TextInput
              {id}
              type="password"
              bind:value={confirmPassword}
              placeholder={$t("auth.resetPassword.confirmPasswordPlaceholder")}
              autocomplete="new-password"
              minlength={12}
              required
              disabled={isSubmitting || !token}
            />
          {/snippet}
        </Field>

        <Button type="submit" block disabled={isSubmitting || !token}>
          {isSubmitting ? $t("auth.resetPassword.setting") : $t("auth.resetPassword.setPassword")}
        </Button>
      </form>
    {/if}

    <div class="mt-6 text-center">
      <a href="/unlock" class="text-sm text-accent no-underline hover:underline">{$t("auth.resetPassword.backToUnlock")}</a>
    </div>
  </Card>
</PageShell>

{#if issuedRecoveryCode}
  <!-- The code that got us here is spent; this replacement is shown once. -->
  <RecoveryCodeDialog
    code={issuedRecoveryCode}
    onConfirm={() => (issuedRecoveryCode = null)}
  />
{/if}
