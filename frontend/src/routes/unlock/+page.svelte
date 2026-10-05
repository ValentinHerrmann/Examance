<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { t, translate } from "#lib/i18n";
  import { deriveKey, deriveKeyWithFallback, generateSalt, getUserSalt, getUserSessionNonce } from "#lib/crypto/keyDerivation";
  import {
    deriveSessionKey,
    generateSessionNonce,
  } from "#lib/crypto/sessionKey";
  import { sessionStore } from "#lib/stores/session";
  import { api, ApiError } from "#lib/api/client";
  import { Argon2UnavailableError } from "#lib/crypto/keyDerivation";
  import { backendStore } from "#lib/stores/backendStore";
  import { get } from "svelte/store";
  import { Card, PageShell } from "#lib/components/ui";
  import UnlockForm from "#lib/components/unlock/UnlockForm.svelte";
  import {
    FactorChooser,
    LockoutNotice,
    RecoveryUnlockDialog,
    SetupCodesDialog,
    SigningInStep,
    TotpEnrollDialog,
    VaultUnlockStep,
  } from "#lib/components/security";
  import {
    submitBackupCode,
    submitPassword,
    submitPasswordFactor,
    submitTotp,
    type AuthStep,
  } from "#lib/api/mfa";
  import { loginOptions, verifyLogin } from "#lib/api/webauthn";
  import { authenticate, isSupported as passkeysSupported } from "#lib/webauthn/client";
  import { addPasskeyWrap, openWithPasskey } from "#lib/services/keyEnvelopeService";
  import {
    EnvelopeChangedError,
    EnvelopeFactorMissingError,
    materializeSession,
    openWithPassword,
    openWithRecoveryCode,
    rewrapForNewPassword,
    startFreshVault,
  } from "#lib/services/keyEnvelopeService";
  import {
    openWorkspace,
  } from "#lib/db/workspace";
  import { workspaceStatusStore } from "#lib/stores/workspaceState";
  import WorkspaceBlocked from "#lib/components/storage/WorkspaceBlocked.svelte";


  let password = $state("");
  let email = $state("");
  let backendUrl = $state(get(backendStore));
  let errorMsg = $state("");
  let isLoading = $state(false);
  /** Set when a login minted a new recovery code that must be shown once. */
  let pendingRecoveryCode: string | null = $state(null);
  /** Set when the password wrap is unusable (as after a password reset); holds what the recovery dialog needs. */
  let pendingRecovery: { teacherId: string; email: string; role: "teacher" | "admin" } | null =
    $state.raw(null);
  // The sign-in in progress (two of three factors). `password` stays in memory until it finishes, since it
  // unwraps the data key once the session is real; it is never persisted or sent anywhere else.
  let authStep = $state.raw<AuthStep | null>(null);
  let factorErrorMsg = $state("");
  /** Backup codes from a just-completed enrollment, shown once. */
  let pendingBackupCodes: string[] | null = $state.raw(null);
  /** Whether to show the codes: minted steps earlier, they must not appear while the sign-in is finishing. */
  let showSetupCodes = $state(false);
  /** Signed in with nothing that opens the vault (e.g. passkey without PRF plus authenticator). */
  let vaultLocked: AuthStep | null = $state.raw(null);
  // Both factors are in and the vault is opening. Rendered ahead of everything else; otherwise the login
  // form showed for as long as Argon2id took, which read as a failed sign-in.
  let isFinishing = $state(false);
  /** The account being signed in, for the panel that says so. */
  let finishingEmail = $state("");
  const canUsePasskeys = passkeysSupported();
  /** PRF secret from a passkey assertion, held until the vault opens (lets passkey + TOTP skip the password). */
  let passkeyUnwrap: { credentialIdB64: string; prfOutput: Uint8Array } | null = null;
  // True only once the server accepted `password` in this sign-in. Unsubmitted text would otherwise be used
  // to open the vault and, on an account without an envelope, seal a wrong data key over every record.
  let passwordVerified = false;
  /** The step whose passkey prompt already auto-started: one attempt per step, a cancel must not re-prompt. */
  let passkeyAutoTriedFor: AuthStep | null = $state.raw(null);
  let passkeyPending = $state(false);
  /** A PRF passkey that signed in but has no working wrap; re-wrapped once the vault opens another way. */
  let passkeyToHeal: { credentialIdB64: string; prfOutput: Uint8Array } | null = $state.raw(null);


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
    passwordVerified = false;
    passkeyUnwrap = null;
    passkeyToHeal = null;
    try {
      // Starting a sign-in demotes the access cookie and clears the refresh cookie, so client state must
      // follow, or an unlocked tab keeps rendering and every request 403s (seen on back-navigation).
      sessionStore.lock();

      // First factor. A correct password no longer produces a session: the
      // server answers with what is still outstanding.
      const step = await submitPassword(normalizedEmail, password);
      passwordVerified = true;

      // Save backend URL to localStorage ONLY after a factor was accepted
      backendStore.saveSuccessfulBackendUrl(trimmedBackendUrl);

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

  /** Act on the server's answer: enrolment needed, another factor outstanding, or vault can be opened. */
  async function handleAuthStep(step: AuthStep) {
    factorErrorMsg = "";

    if (step.status !== "ok") {
      // Enrollment and the second factor are both rendered from `authStep`.
      authStep = step;
      return;
    }

    // Deliberately not stored: there is nothing to render from an "ok" step, and
    // keeping the previous `factor_required` one is what lets the chooser come
    // back — with its error visible — if opening the vault fails.
    isFinishing = true;
    finishingEmail = step.email;
    try {
      await openVault(step);
    } catch (err) {
      isFinishing = false;
      throw err;
    }
  }

  // Recover the data key and start the session. On a pre-envelope account this runs the one-time migration,
  // adopting the old derived key as the data key so nothing is re-encrypted.
  async function openVault(step: AuthStep) {
    const normalizedEmail = step.email.trim().toLowerCase();
    let vault;

    if (passkeyUnwrap) {
      // Signed in without the password. The passkey's PRF secret opens the
      // vault instead, which is the whole reason that secret is asked for
      // during the ceremony.
      const unwrap = passkeyUnwrap;
      passkeyUnwrap = null;
      try {
        vault = await openWithPasskey(step.id, unwrap.credentialIdB64, unwrap.prfOutput);
      } catch (passkeyErr) {
        // A PRF passkey with no usable wrap (never wrapped, or sealed under another passkey's secret): fall
        // back to a server-checked password, else ask, and re-wrap once open. A changed envelope set is the
        // substitution alarm and must surface.
        if (passkeyErr instanceof EnvelopeChangedError) {
          throw passkeyErr;
        }
        console.warn("[Crypto Warning] Passkey could not open the vault:", passkeyErr);
        passkeyToHeal = unwrap;
        vault = null;
      }
      if (vault) {
        await finishUnlock(step, normalizedEmail, vault);
        return;
      }
    }

    if (!password || !passwordVerified) {
      // Nothing here can open the vault (no PRF secret, no password), so ask; unwrapping with an empty
      // string used to surface as a bogus "code not valid".
      vaultLocked = step;
      authStep = null;
      isFinishing = false;
      return;
    }

    try {
      // Server-verified, so the one-time migration may run on it.
      vault = await openWithPassword(step.id, normalizedEmail, password, {
        allowMigration: true,
      });
    } catch (envelopeErr) {
      if (envelopeErr instanceof EnvelopeFactorMissingError) {
        // The password is correct — the server accepted it — but it no longer
        // opens the stored key. That is what a reset leaves behind, and the
        // recovery code is the way out of it.
        pendingRecovery = { teacherId: step.id, email: step.email, role: step.role };
        authStep = null;
        isFinishing = false;
        return;
      }
      throw envelopeErr;
    }

    await finishUnlock(step, normalizedEmail, vault);
  }

  // Leave for an authenticated session. The session must own this browser's workspace and the
  // account's storage mode is loaded (lib/db/workspace.ts); a blocked workspace stays on this page
  // with an explanation, an unchosen mode is asked for by the root layout.
  async function enterApp() {
    // A workspace this account does not own stays on this page with an explanation (see template).
    const status = await openWorkspace();
    if (status.state === "blocked") {
      isFinishing = false;
      return;
    }
    await goto("/");
  }

  /** Start the session from an opened vault and leave the sign-in screen. */
  async function finishUnlock(
    step: AuthStep,
    normalizedEmail: string,
    vault: Awaited<ReturnType<typeof openWithPassword>>,
  ) {
    if (passkeyToHeal) {
      // The vault was opened by a route that proves the data key (an existing
      // envelope unwrapped, or a server-checked password), so wrapping it for
      // this passkey is safe. Best effort: the sign-in must not fail over it.
      const heal = passkeyToHeal;
      passkeyToHeal = null;
      try {
        await addPasskeyWrap(step.id, vault, heal.credentialIdB64, heal.prfOutput);
      } catch (err) {
        console.warn("[Crypto Warning] Could not store a wrap for this passkey:", err);
      }
    }
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
      pendingRecoveryCode = vault.newRecoveryCode;
    }

    if (pendingRecoveryCode || pendingBackupCodes) {
      // Shown once, and the dashboard waits until they are acknowledged: these
      // are the only copies of the two factors that always work.
      showSetupCodes = true;
      isFinishing = false;
      return;
    }

    await enterApp();
  }

  // Sign in with a passkey, in either factor position. With PRF the assertion also yields the secret that
  // opens the vault, so passkey + authenticator never needs the password.
  async function handlePasskey(opts: { auto?: boolean } = {}) {
    // Which error slot to write to. Mid-sign-in the form is not on screen, so a
    // failure reported there would be invisible.
    const inProgress = authStep !== null;
    errorMsg = "";
    factorErrorMsg = "";
    isLoading = true;
    passkeyPending = inProgress;
    try {
      if (!inProgress) {
        // A passkey-first sign-in never submitted the password field, so its
        // contents are unverified and must not open (or migrate) the vault.
        passwordVerified = false;
        passkeyUnwrap = null;
        passkeyToHeal = null;
        // As in handleUnlock, the new sign-in demotes the cookie, so lock client state, but not while a
        // sign-in is already running (that would discard the step in progress).
        sessionStore.lock();
      }

      const trimmedBackendUrl = backendUrl.trim();
      if (trimmedBackendUrl) {
        try {
          backendStore.setTransient(trimmedBackendUrl);
        } catch (err: any) {
          const errText = err?.message ?? translate("auth.unlock.errors.invalidBackendUrl");
          if (inProgress) {
            factorErrorMsg = errText;
          } else {
            errorMsg = errText;
          }
          return;
        }
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
      if (opts.auto && isCeremonyCancelled(err)) {
        // The automatic prompt was declined: the chooser below is the answer,
        // not an error.
        return;
      }
      const message = err instanceof ApiError ? err.message : "";
      const text = message || translate("security.passkey.failed");
      if (inProgress) {
        factorErrorMsg = text;
      } else {
        errorMsg = text;
      }
    } finally {
      isLoading = false;
      passkeyPending = false;
    }
  }

  /** The user dismissed the browser's passkey dialog (or it was refused without a gesture). */
  function isCeremonyCancelled(err: unknown): boolean {
    if (err instanceof DOMException) {
      return err.name === "NotAllowedError" || err.name === "AbortError";
    }
    return err instanceof Error && /cancelled/i.test(err.message);
  }

  /** Passkey first, and only what this browser can actually present. */
  let chooserFactors = $derived(
    authStep
      ? [...authStep.available]
          .filter((f) => f !== "passkey" || canUsePasskeys)
          .sort((a, b) => Number(b === "passkey") - Number(a === "passkey"))
      : [],
  );

  // Message for a failure *after* the server accepted the factor; null when the factor itself failed.
  // Keeps key problems (e.g. Argon2 failing to load) from being reported as a wrong credential.
  function vaultFailureMessage(err: unknown): string | null {
    if (err instanceof Argon2UnavailableError) {
      return translate("security.vaultUnlock.kdfUnavailable");
    }
    if (err instanceof EnvelopeChangedError) {
      return translate("security.envelope.changedBody");
    }
    return null;
  }

  /** The password as the second factor, kept in `password` because `openVault` needs it to unwrap. */
  async function handlePasswordFactor(entered: string) {
    factorErrorMsg = "";
    try {
      const step = await submitPasswordFactor(entered);
      password = entered;
      passwordVerified = true;
      await handleAuthStep(step);
    } catch (err: any) {
      const code = err instanceof ApiError ? err.code : "";
      factorErrorMsg =
        vaultFailureMessage(err) ??
        (code === "ERR_ACCOUNT_LOCKED"
          ? translate("errors.code.ERR_ACCOUNT_LOCKED")
          : code === "ERR_STEP_EXPIRED"
            ? translate("security.factors.expired")
            : translate("security.factors.wrongPassword"));
    }
  }

  /** Unwrap the vault after a sign-in that produced no key material. */
  async function handleVaultPassword(entered: string) {
    if (!vaultLocked) {
      return;
    }
    const step = vaultLocked;
    const normalizedEmail = step.email.trim().toLowerCase();
    // Not checked by the server, so never allowed to run the migration: an
    // account without an envelope must sign in with its password once first.
    const vault = await openWithPassword(step.id, normalizedEmail, entered, {
      allowMigration: false,
    });
    password = entered;
    // Busy panel before the step is cleared, or the last stretch falls through
    // to the login form again.
    isFinishing = true;
    finishingEmail = step.email;
    vaultLocked = null;
    await finishUnlock(step, normalizedEmail, vault);
  }

  // Unwrap with the recovery code. Deliberately no re-wrap (unlike `handleRecovery`): the wraps are fine
  // and no password was typed, so rewrapping would seal the account under an empty string.
  async function handleVaultRecovery(recoveryCode: string) {
    if (!vaultLocked) {
      return;
    }
    const step = vaultLocked;
    const normalizedEmail = step.email.trim().toLowerCase();
    const vault = await openWithRecoveryCode(step.id, recoveryCode);
    isFinishing = true;
    finishingEmail = step.email;
    vaultLocked = null;
    await finishUnlock(step, normalizedEmail, vault);
  }

  /** Second factor: an authenticator code, or a backup code standing in for one. */
  async function handleSecondFactor(code: string, useBackupCode: boolean) {
    factorErrorMsg = "";
    try {
      const step = useBackupCode ? await submitBackupCode(code) : await submitTotp(code);
      await handleAuthStep(step);
    } catch (err: any) {
      const code = err instanceof ApiError ? err.code : "";
      factorErrorMsg =
        vaultFailureMessage(err) ??
        (code === "ERR_ACCOUNT_LOCKED"
          ? translate("errors.code.ERR_ACCOUNT_LOCKED")
          : code === "ERR_MFA_CODE_ALREADY_USED"
            // The code is right, its window is spent. Every sign-in straight
            // after a password reset lands here, because the reset took a code
            // of its own moments earlier.
            ? translate("security.factors.alreadyUsed")
            : code === "ERR_STEP_EXPIRED"
              // A wrong code is retryable and an expired step is not, so saying
              // "that code is not valid" to both leaves the teacher retyping a
              // correct code into a sign-in that has already ended.
              ? translate("security.factors.expired")
              : translate("security.factors.invalid"));
    }
  }

  // Enrollment finished: replay the still-held password to turn the enrollment token into a real session
  // and store the key for the first time.
  async function handleEnrolled(backupCodes: string[]) {
    // Held, not shown. The recovery code does not exist yet — it is minted when
    // the key envelope is created a few steps from here — and showing the two
    // sets in sequence is what made the second look like a repeat of the first.
    pendingBackupCodes = backupCodes;
    authStep = null;
    // Past the credentials already: the replay must not fall through to the
    // login form either.
    isFinishing = true;
    finishingEmail = email.trim().toLowerCase();
    isLoading = true;
    try {
      const step = await submitPassword(email.trim().toLowerCase(), password);
      passwordVerified = true;
      await handleAuthStep(step);
    } catch (err: any) {
      isFinishing = false;
      errorMsg = err?.message || translate("auth.unlock.errors.unlockFailed");
    } finally {
      isLoading = false;
    }
  }

  async function handleSetupCodesAcknowledged() {
    pendingBackupCodes = null;
    pendingRecoveryCode = null;
    showSetupCodes = false;
    await enterApp();
  }

  // Finish a recovery: unwrap the data key with the code, re-wrap it under the new password. The key
  // never changes, so every existing exam, scan and score stays readable.
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
    showSetupCodes = true;
  }

  // Open the vault with a passkey instead of the recovery code: a reset invalidates only the password
  // wrap, so a PRF passkey still recovers everything. Offered before the route that gives data up.
  async function handleRecoveryPasskey() {
    if (!pendingRecovery) {
      return;
    }
    const { teacherId, email: userEmail, role } = pendingRecovery;
    const options = await loginOptions();
    const assertion = await authenticate(options);
    if (!assertion.prfOutput) {
      // The authenticator answered without a PRF result, so it does not
      // implement the extension. Reported as the missing wrap it amounts to, so
      // the dialog can say which passkeys *can* open the data.
      throw new EnvelopeFactorMissingError("passkey");
    }
    const parsed = JSON.parse(assertion.credentialJson) as { rawId: string };
    const vault = await openWithPasskey(teacherId, parsed.rawId, assertion.prfOutput);

    const normalizedEmail = userEmail.trim().toLowerCase();
    const keys = await materializeSession(vault, normalizedEmail);
    sessionStore.unlock({
      ...keys,
      email: userEmail,
      teacherId,
      role,
      mode: "authenticated",
    });
    pendingRecovery = null;
    await enterApp();
  }

  // Last resort: give up the old data key and start again under the current password (reset password,
  // lost recovery code). Irreversible; the dialog says so before calling this.
  async function handleStartFresh() {
    if (!pendingRecovery) {
      return;
    }
    const { teacherId, email: userEmail, role } = pendingRecovery;
    const normalizedEmail = userEmail.trim().toLowerCase();

    const vault = await startFreshVault(teacherId, password);
    const keys = await materializeSession(vault, normalizedEmail);
    sessionStore.unlock({
      ...keys,
      email: userEmail,
      teacherId,
      role,
      mode: "authenticated",
    });

    pendingRecovery = null;
    pendingRecoveryCode = vault.newRecoveryCode ?? null;
    showSetupCodes = true;
  }

  // A passkey is the preferred second factor: its prompt opens by itself, once per step. Cancelling
  // leaves the chooser.
  $effect.pre(() => {
    const step = authStep;
    const loading = isLoading;
    const triedFor = passkeyAutoTriedFor;
    if (
      step &&
      step.status === "factor_required" &&
      step.available.includes("passkey") &&
      canUsePasskeys &&
      !loading &&
      triedFor !== step
    ) {
      untrack(() => {
        passkeyAutoTriedFor = step;
        void handlePasskey({ auto: true });
      });
    }
  });
</script>

<PageShell width="medium" center flush class="gap-4 py-3">
  <!-- Above the step: the cooloff can be hit from the form, the second factor and the vault prompt alike. -->
  <LockoutNotice />

  {#if $workspaceStatusStore.state === "blocked"}
    <WorkspaceBlocked reason={$workspaceStatusStore.reason} />
  {:else if isFinishing}
    <Card class="mx-auto w-full max-w-form sm:p-6">
      <SigningInStep email={finishingEmail} />
    </Card>
  {:else if authStep && authStep.status === "factor_required"}
    <!-- One factor is in; the password stays in memory, so this step replaces the form instead of routing. -->
    <Card class="mx-auto w-full max-w-form sm:p-6">
      <FactorChooser
        available={chooserFactors}
        {passkeyPending}
        onTotp={handleSecondFactor}
        onPassword={handlePasswordFactor}
        onPasskey={() => handlePasskey()}
        errorMsg={factorErrorMsg}
      />
    </Card>
  {:else if vaultLocked}
    <Card class="mx-auto w-full max-w-form sm:p-6">
      <VaultUnlockStep
        passkeyCanHeal={passkeyToHeal !== null}
        onPassword={handleVaultPassword}
        onRecoveryCode={handleVaultRecovery}
      />
    </Card>
  {:else}
    <UnlockForm
      bind:backendUrl
      bind:email
      bind:password
      {errorMsg}
      {isLoading}
      onUnlock={handleUnlock}
      onPasskey={canUsePasskeys ? () => handlePasskey() : undefined}
    />
  {/if}
</PageShell>

{#if authStep && authStep.status === "enroll_required"}
  <TotpEnrollDialog onEnrolled={handleEnrolled} />
{/if}

{#if pendingRecovery}
  <RecoveryUnlockDialog
    onSubmit={handleRecovery}
    onPasskey={canUsePasskeys ? handleRecoveryPasskey : undefined}
    onStartFresh={handleStartFresh}
  />
{/if}

{#if showSetupCodes}
  <SetupCodesDialog
    backupCodes={pendingBackupCodes}
    recoveryCode={pendingRecoveryCode}
    onConfirm={handleSetupCodesAcknowledged}
  />
{/if}
