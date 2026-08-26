<script lang="ts">
  import "./+page.css";
  import { goto } from "$app/navigation";
  import { t, translate } from "$lib/i18n";
  import { deriveKey, deriveKeyWithFallback, generateSalt, getUserSalt, getUserSessionNonce } from "$lib/crypto/keyDerivation";
  import {
    deriveSessionKey,
    generateSessionNonce,
  } from "$lib/crypto/sessionKey";
  import {
    hasLegacyLocalVault,
    hasLocalVault,
    sessionStore,
  } from "$lib/stores/session";
  import { api, ApiError } from "$lib/api/client";
  import { backendStore } from "$lib/stores/backendStore";
  import { recordValue } from "$lib/utils/recentValues";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { get } from "svelte/store";
  import UnlockForm from "$lib/components/unlock/UnlockForm.svelte";
  import {
    BackupCodeList,
    RecoveryCodeDialog,
    RecoveryUnlockDialog,
    TotpEnrollDialog,
    TotpFactor,
  } from "$lib/components/security";
  import {
    submitBackupCode,
    submitPassword,
    submitTotp,
    type AuthStep,
  } from "$lib/api/mfa";
  import { loginOptions, verifyLogin } from "$lib/api/webauthn";
  import { authenticate, isSupported as passkeysSupported } from "$lib/webauthn/client";
  import { openWithPasskey } from "$lib/services/keyEnvelopeService";
  import {
    EnvelopeChangedError,
    EnvelopeFactorMissingError,
    materializeSession,
    openWithPassword,
    openWithRecoveryCode,
    rewrapForNewPassword,
  } from "$lib/services/keyEnvelopeService";

  const LOCAL_PASSPHRASE_MIN_LENGTH = 12;

  let password = "";
  let email = "";
  let backendUrl = get(backendStore);
  let errorMsg = "";
  let isLoading = false;
  /** Set when a login minted a new recovery code that must be shown once. */
  let pendingRecoveryCode: string | null = null;
  /**
   * Set when the account's password wrap is unusable — the state a password
   * reset leaves behind. Holds what the recovery dialog needs to finish the job.
   */
  let pendingRecovery: { teacherId: string; email: string; role: "teacher" | "admin" } | null =
    null;
  /**
   * The sign-in in progress.
   *
   * A sign-in presents two of three factors, so the page is a small state
   * machine rather than one form post. The password stays in `password` until
   * the whole thing finishes — it is needed to unwrap the data key once the
   * session is real, and it is never persisted or sent anywhere else.
   */
  let authStep: AuthStep | null = null;
  let factorErrorMsg = "";
  /** Backup codes from a just-completed enrollment, shown once. */
  let pendingBackupCodes: string[] | null = null;
  const canUsePasskeys = passkeysSupported();
  /**
   * The PRF secret from a passkey assertion, held until the vault is opened.
   *
   * A passkey that supports PRF can unwrap the data key, which is what makes
   * a passkey-plus-authenticator sign-in work without the password at all.
   */
  let passkeyUnwrap: { credentialIdB64: string; prfOutput: Uint8Array } | null = null;

  // Local workspace passphrase. Never persisted — it is the only input to the
  // key derivation, so losing it means the local vault cannot be opened.
  let localPassphrase = "";
  let localPassphraseConfirm = "";
  const needsLegacyMigration = hasLegacyLocalVault();
  const isNewLocalVault = !hasLocalVault() || needsLegacyMigration;

  async function handleUnlock() {
    errorMsg = "";
    const trimmedBackendUrl = backendUrl.trim();
    if (!trimmedBackendUrl) {
      errorMsg = translate("auth.unlock.errors.enterServerAddress");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      errorMsg = translate("auth.unlock.errors.enterEmail");
      return;
    }
    if (!password) {
      errorMsg = translate("auth.unlock.errors.enterPassword");
      return;
    }

    // Set transient backend URL for authentication attempt. Validated before
    // use — credentials are about to be posted to whatever this points at.
    try {
      backendStore.setTransient(trimmedBackendUrl);
    } catch (err: any) {
      errorMsg = err?.message ?? translate("auth.unlock.errors.invalidBackendUrl");
      return;
    }

    isLoading = true;
    try {
      // First factor. A correct password no longer produces a session: the
      // server answers with what is still outstanding.
      const step = await submitPassword(normalizedEmail, password);

      // Save backend URL to localStorage ONLY after a factor was accepted
      backendStore.saveSuccessfulBackendUrl(trimmedBackendUrl);
      recordValue("backend.url", trimmedBackendUrl);

      // Persist server mode configuration in browser if previously set to all-local
      if (get(storagePolicyStore).storageMode === "all-local") {
        storagePolicyStore.updateSetting("storageMode", "all-server");
      }

      await handleAuthStep(step);
    } catch (err: any) {
      // Revert store to last saved URL if authentication failed
      backendStore.restoreSavedUrl();
      if (err instanceof ApiError && err.code === 'ERR_ACCOUNT_LOCKED') {
        errorMsg = translate("errors.code.ERR_ACCOUNT_LOCKED");
      } else if (err instanceof EnvelopeChangedError) {
        errorMsg = translate("security.envelope.changedBody");
      } else if (err instanceof EnvelopeFactorMissingError) {
        errorMsg = translate("security.envelope.missingPassword");
      } else {
        // "Failed to fetch" is the browser's opaque network error for CORS
        // preflight rejections. Give users a concrete hint.
        const raw: string = err.message || '';
        errorMsg =
          raw === 'Failed to fetch'
            ? translate("auth.unlock.errors.couldNotReachServer")
            : raw || translate("auth.unlock.errors.unlockFailed");
      }
    } finally {
      isLoading = false;
    }
  }

  /**
   * Act on whatever the server said about the sign-in.
   *
   * Three outcomes, mirroring the policy: the account needs to enrol before it
   * can authenticate at all; another factor is outstanding; or two distinct
   * factors are in and the vault can be opened.
   */
  async function handleAuthStep(step: AuthStep) {
    authStep = step;
    factorErrorMsg = "";

    if (step.status !== "ok") {
      // Enrollment and the second factor are both rendered from `authStep`.
      return;
    }

    await openVault(step);
  }

  /**
   * Recover the data key and start the session.
   *
   * On an account that predates the key envelope this performs the one-time
   * migration, which adopts the previously derived key as the data key — so
   * nothing has to be re-encrypted and the session key is byte-identical to the
   * one the old scheme produced.
   */
  async function openVault(step: AuthStep) {
    const normalizedEmail = step.email.trim().toLowerCase();
    let vault;

    if (passkeyUnwrap) {
      // Signed in without the password. The passkey's PRF secret opens the
      // vault instead, which is the whole reason that secret is asked for
      // during the ceremony.
      vault = await openWithPasskey(
        step.id,
        passkeyUnwrap.credentialIdB64,
        passkeyUnwrap.prfOutput,
      );
      passkeyUnwrap = null;
      await finishUnlock(step, normalizedEmail, vault);
      return;
    }

    try {
      vault = await openWithPassword(step.id, normalizedEmail, password);
    } catch (envelopeErr) {
      if (envelopeErr instanceof EnvelopeFactorMissingError) {
        // The password is correct — the server accepted it — but it no longer
        // opens the stored key. That is what a reset leaves behind, and the
        // recovery code is the way out of it.
        pendingRecovery = { teacherId: step.id, email: step.email, role: step.role };
        authStep = null;
        return;
      }
      throw envelopeErr;
    }

    await finishUnlock(step, normalizedEmail, vault);
  }

  /** Start the session from an opened vault and leave the sign-in screen. */
  async function finishUnlock(
    step: AuthStep,
    normalizedEmail: string,
    vault: Awaited<ReturnType<typeof openWithPassword>>,
  ) {
    const keys = await materializeSession(vault, normalizedEmail);
    sessionStore.unlock({
      ...keys,
      email: step.email,
      teacherId: step.id,
      role: step.role,
      mode: "authenticated",
    });

    authStep = null;

    if (vault.newRecoveryCode) {
      // Shown once, and the dashboard waits until it is acknowledged: this is
      // the only copy of the factor that always works.
      pendingRecoveryCode = vault.newRecoveryCode;
      return;
    }

    await goto("/");
  }

  /**
   * Sign in with a passkey.
   *
   * Works in either factor position: the server adds `passkey` to whatever the
   * sign-in has already collected. Where the authenticator supports PRF the
   * assertion also yields the secret that opens the vault, so a
   * passkey-plus-authenticator sign-in never needs the password.
   */
  async function handlePasskey() {
    errorMsg = "";
    factorErrorMsg = "";
    isLoading = true;
    try {
      const trimmedBackendUrl = backendUrl.trim();
      if (trimmedBackendUrl) {
        backendStore.setTransient(trimmedBackendUrl);
      }

      const options = await loginOptions();
      const assertion = await authenticate(options);
      const step = await verifyLogin({
        handle: options.handle,
        challenge_b64: options.challenge_b64,
        credential_json: assertion.credentialJson,
      });

      if (trimmedBackendUrl) {
        backendStore.saveSuccessfulBackendUrl(trimmedBackendUrl);
      }

      if (assertion.prfOutput) {
        const parsed = JSON.parse(assertion.credentialJson) as { rawId: string };
        passkeyUnwrap = { credentialIdB64: parsed.rawId, prfOutput: assertion.prfOutput };
      }

      await handleAuthStep(step);
    } catch (err: any) {
      const message = err instanceof ApiError ? err.message : "";
      errorMsg = message || translate("security.passkey.failed");
    } finally {
      isLoading = false;
    }
  }

  /** Second factor: an authenticator code, or a backup code standing in for one. */
  async function handleSecondFactor(code: string, useBackupCode: boolean) {
    factorErrorMsg = "";
    try {
      const step = useBackupCode ? await submitBackupCode(code) : await submitTotp(code);
      await handleAuthStep(step);
    } catch (err: any) {
      factorErrorMsg =
        err instanceof ApiError && err.code === "ERR_ACCOUNT_LOCKED"
          ? translate("errors.code.ERR_ACCOUNT_LOCKED")
          : translate("security.factors.invalid");
    }
  }

  /**
   * Enrollment finished. The account now has two factors, so replay the
   * password to turn the enrollment token into a real session — the password is
   * still in hand, which is exactly what storing the key for the first time
   * needs.
   */
  async function handleEnrolled(backupCodes: string[]) {
    pendingBackupCodes = backupCodes;
    authStep = null;
  }

  async function handleBackupCodesAcknowledged() {
    pendingBackupCodes = null;
    isLoading = true;
    try {
      await handleAuthStep(await submitPassword(email.trim().toLowerCase(), password));
    } catch (err: any) {
      errorMsg = err?.message || translate("auth.unlock.errors.unlockFailed");
    } finally {
      isLoading = false;
    }
  }

  async function handleUnlockLocal() {
    errorMsg = "";

    if (!localPassphrase) {
      errorMsg = translate("auth.unlock.errors.enterLocalPassphrase");
      return;
    }
    if (isNewLocalVault || needsLegacyMigration) {
      if (localPassphrase.length < LOCAL_PASSPHRASE_MIN_LENGTH) {
        errorMsg = translate("auth.unlock.errors.passphraseTooShort", { minLength: LOCAL_PASSPHRASE_MIN_LENGTH });
        return;
      }
      if (localPassphrase !== localPassphraseConfirm) {
        errorMsg = translate("auth.unlock.errors.passphrasesDoNotMatch");
        return;
      }
    }

    isLoading = true;
    try {
      storagePolicyStore.updateSetting("storageMode", "all-local");

      if (needsLegacyMigration) {
        // Re-encrypts the existing vault away from the password that used to
        // sit in localStorage. Nothing is deleted unless this succeeds.
        await sessionStore.migrateLegacyLocalVault(localPassphrase);
      } else {
        await sessionStore.unlockLocalSession(localPassphrase);
      }

      await goto("/");
    } catch (err: any) {
      errorMsg = err?.message || translate("auth.unlock.errors.localSessionInitFailed");
    } finally {
      isLoading = false;
    }
  }

  /**
   * Finish a recovery: unwrap the data key with the code, then re-wrap it under
   * the password the teacher just signed in with. The key itself never changes,
   * so every existing exam, scan and score stays readable.
   */
  async function handleRecovery(recoveryCode: string) {
    if (!pendingRecovery) {
      return;
    }
    const { teacherId, email: userEmail, role } = pendingRecovery;
    const normalizedEmail = userEmail.trim().toLowerCase();

    const vault = await openWithRecoveryCode(teacherId, recoveryCode);
    const newCode = await rewrapForNewPassword(teacherId, vault, password);
    const keys = await materializeSession(vault, normalizedEmail);

    sessionStore.unlock({
      ...keys,
      email: userEmail,
      teacherId,
      role,
      mode: "authenticated",
    });

    pendingRecovery = null;
    // The code just used is spent; the replacement is shown once.
    pendingRecoveryCode = newCode;
  }
</script>

<div class="unlock-container flex min-h-full flex-col items-center justify-center box-border px-4 py-8 sm:px-6 sm:py-12">
  {#if authStep && authStep.status === "factor_required"}
    <!--
      One factor is in. The password stays in memory until the vault is open,
      so this step is rendered in place of the form rather than on a new route.
    -->
    <div class="w-full max-w-form rounded-xl border border-line bg-surface-raised p-5 sm:p-6">
      <TotpFactor onSubmit={handleSecondFactor} errorMsg={factorErrorMsg} />
    </div>
  {:else}
    <UnlockForm
      bind:backendUrl
      bind:email
      bind:password
      bind:localPassphrase
      bind:localPassphraseConfirm
      {isNewLocalVault}
      {needsLegacyMigration}
      {errorMsg}
      {isLoading}
      onUnlock={handleUnlock}
      onUnlockLocal={handleUnlockLocal}
    />

    {#if canUsePasskeys}
      <!--
        A passkey identifies the account by itself, so it works as the first
        factor without an email being typed at all.
      -->
      <button
        type="button"
        class="mt-4 cursor-pointer border-none bg-transparent p-0 text-sm text-accent underline
               disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading}
        on:click={handlePasskey}
      >
        {$t("security.passkey.signIn")}
      </button>
    {/if}
  {/if}
</div>

{#if authStep && authStep.status === "enroll_required"}
  <TotpEnrollDialog onEnrolled={handleEnrolled} />
{/if}

{#if pendingBackupCodes}
  <BackupCodeList codes={pendingBackupCodes} onConfirm={handleBackupCodesAcknowledged} />
{/if}

{#if pendingRecovery}
  <RecoveryUnlockDialog onSubmit={handleRecovery} />
{/if}

{#if pendingRecoveryCode}
  <RecoveryCodeDialog
    code={pendingRecoveryCode}
    onConfirm={() => {
      pendingRecoveryCode = null;
      goto("/");
    }}
  />
{/if}
