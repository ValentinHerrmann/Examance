<script lang="ts">
  /**
   * Password reset, as a short wizard.
   *
   * Two things changed under this page. A reset now needs a second factor —
   * mailbox access alone taking over an account is the bypass that closes — and
   * it re-establishes access to the teacher's *data*, not just their login.
   *
   * The data key is unwrapped here in the browser with the recovery code and
   * re-wrapped under the new password. Nothing is re-encrypted, and the new
   * password and the matching key copy are sent in one request so they cannot
   * end up disagreeing.
   */
  import { onMount } from "svelte";
  import { api, ApiError } from "$lib/api/client";
  import { t, translate } from "$lib/i18n";
  import { startReset, submitBackupCode, submitTotp, type AuthStep } from "$lib/api/mfa";
  import { envelopeSetToDto } from "$lib/api/keyEnvelopes";
  import {
    buildResetEnvelopeSet,
    openWithRecoveryCode,
    pinEnvelopeSet,
  } from "$lib/services/keyEnvelopeService";
  import { RecoveryCodeDialog, TotpFactor } from "$lib/components/security";
  import { Button, Field, TextInput } from "$lib/components/ui";

  type Stage = "password" | "factor" | "key";

  let token = "";
  let newPassword = "";
  let confirmPassword = "";
  let isSubmitting = false;
  let errorMsg = "";
  let successMsg = "";

  let stage: Stage = "password";
  let step: AuthStep | null = null;
  let factorErrorMsg = "";
  let recoveryCode = "";
  let recoveryErrorMsg = "";
  let skipConfirmed = false;
  /** A freshly minted recovery code, shown once after a successful reset. */
  let issuedRecoveryCode: string | null = null;

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
    } catch {
      factorErrorMsg = translate("security.factors.invalid");
    }
  }

  /**
   * Step three: recover the data key and finish.
   *
   * Sending the re-wrapped key with the new password keeps the two in one
   * transaction. Skipping it resets the password and leaves the old data sealed
   * — which the confirmation above says in those words.
   */
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
        const vault = await openWithRecoveryCode(step.id, recoveryCode);
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

<div class="reset-password-container flex min-h-full items-center justify-center box-border px-4 py-8 sm:px-6 sm:py-12">
  <div class="reset-password-card w-full max-w-form">
    <div class="card-header">
      <img src="/favicon.png" alt="Examance logo" class="brand-logo" />
      <h1>{$t("auth.resetPassword.title")}</h1>
      <p class="subtitle">{$t("auth.resetPassword.subtitle")}</p>
    </div>

    {#if successMsg}
      <div class="banner success">{successMsg}</div>
      <div class="action-box">
        <a href="/unlock" class="primary-btn-link">{$t("auth.resetPassword.proceedToSignIn")}</a>
      </div>
    {:else if stage === "factor"}
      <h2 class="m-0 text-lg font-semibold text-accent">{$t("security.reset.step2Title")}</h2>
      <p class="mt-1 mb-4 text-sm text-muted">{$t("security.reset.step2Intro")}</p>
      <TotpFactor onSubmit={handleSecondFactor} errorMsg={factorErrorMsg} />
    {:else if stage === "key"}
      <h2 class="m-0 text-lg font-semibold text-accent">{$t("security.reset.keyTitle")}</h2>
      <p class="mt-1 mb-4 text-sm text-muted">{$t("security.reset.keyIntro")}</p>

      <form class="flex flex-col gap-4" on:submit|preventDefault={() => finishReset(true)}>
        <Field label={$t("security.unlock.label")} error={recoveryErrorMsg}>
          <TextInput
            bind:value={recoveryCode}
            placeholder={$t("security.unlock.placeholder")}
            class="font-mono tracking-wider"
          />
        </Field>

        <Button
          type="submit"
          block
          disabled={isSubmitting || !recoveryCode.trim()}
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
          <Button variant="danger" disabled={isSubmitting} onClick={() => finishReset(false)}>
            {$t("security.reset.keySkipConfirm")}
          </Button>
        {:else}
          <button
            type="button"
            class="cursor-pointer border-none bg-transparent p-0 text-left text-sm text-accent underline"
            on:click={() => (skipConfirmed = true)}
          >
            {$t("security.reset.keySkip")}
          </button>
        {/if}
      </div>
    {:else}
      {#if errorMsg}
        <div class="banner error">{errorMsg}</div>
      {/if}

      <form on:submit|preventDefault={handleResetPassword}>
        <div class="form-group">
          <label for="newPassword">{$t("auth.resetPassword.newPasswordLabel")}</label>
          <input
            id="newPassword"
            type="password"
            bind:value={newPassword}
            placeholder={$t("auth.resetPassword.newPasswordPlaceholder")}
            autocomplete="new-password"
            minlength="12"
            required
            disabled={isSubmitting || !token}
          />
        </div>

        <div class="form-group">
          <label for="confirmPassword">{$t("auth.resetPassword.confirmPasswordLabel")}</label>
          <input
            id="confirmPassword"
            type="password"
            bind:value={confirmPassword}
            placeholder={$t("auth.resetPassword.confirmPasswordPlaceholder")}
            autocomplete="new-password"
            minlength="12"
            required
            disabled={isSubmitting || !token}
          />
        </div>

        <button type="submit" class="submit-btn" disabled={isSubmitting || !token}>
          {isSubmitting ? $t("auth.resetPassword.setting") : $t("auth.resetPassword.setPassword")}
        </button>
      </form>
    {/if}

    <div class="card-footer">
      <a href="/unlock" class="back-link">{$t("auth.resetPassword.backToUnlock")}</a>
    </div>
  </div>
</div>

{#if issuedRecoveryCode}
  <!-- The code that got us here is spent; this replacement is shown once. -->
  <RecoveryCodeDialog
    code={issuedRecoveryCode}
    onConfirm={() => (issuedRecoveryCode = null)}
  />
{/if}

<style>
  .reset-password-container {
    background-color: #0f172a;
    color: #f8fafc;
  }

  .reset-password-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 2.5rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
  }

  .card-header {
    text-align: center;
    margin-bottom: 1.75rem;
  }

  .brand-logo {
    width: 56px;
    height: 56px;
    object-fit: contain;
    margin-bottom: 0.75rem;
    border-radius: 12px;
  }

  .card-header h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 800;
    color: #38bdf8;
  }

  .subtitle {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #94a3b8;
    line-height: 1.4;
  }

  .banner {
    padding: 0.85rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .banner.success {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid #22c55e;
    color: #86efac;
  }

  .banner.error {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }

  .action-box {
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .primary-btn-link {
    display: inline-block;
    width: 100%;
    padding: 0.75rem;
    background: #0284c7;
    color: white;
    text-align: center;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
    box-sizing: border-box;
  }

  .primary-btn-link:hover {
    background: #0369a1;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .form-group label {
    font-size: 0.8rem;
    font-weight: 500;
    color: #cbd5e1;
  }

  .form-group input {
    padding: 0.65rem 0.75rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f8fafc;
    font-size: 0.875rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .submit-btn {
    width: 100%;
    padding: 0.75rem;
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .submit-btn:hover:not(:disabled) {
    background: #0369a1;
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .card-footer {
    margin-top: 1.5rem;
    text-align: center;
  }

  .back-link {
    font-size: 0.85rem;
    color: #38bdf8;
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }
</style>