<script lang="ts">
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
  import { Argon2UnavailableError } from "$lib/crypto/keyDerivation";
  import { backendStore } from "$lib/stores/backendStore";
  import { get } from "svelte/store";
  import { Card, PageShell } from "$lib/components/ui";
  import UnlockForm from "$lib/components/unlock/UnlockForm.svelte";
  import {
    FactorChooser,
    LockoutNotice,
    RecoveryUnlockDialog,
    SetupCodesDialog,
    SigningInStep,
    TotpEnrollDialog,
    VaultUnlockStep,
  } from "$lib/components/security";
  import {
    submitBackupCode,
    submitPassword,
    submitPasswordFactor,
    submitTotp,
    type AuthStep,
  } from "$lib/api/mfa";
  import { loginOptions, verifyLogin } from "$lib/api/webauthn";
  import { authenticate, isSupported as passkeysSupported } from "$lib/webauthn/client";
  import { addPasskeyWrap, openWithPasskey } from "$lib/services/keyEnvelopeService";
  import {
    EnvelopeChangedError,
    EnvelopeFactorMissingError,
    materializeSession,
    openWithPassword,
    openWithRecoveryCode,
    rewrapForNewPassword,
    startFreshVault,
  } from "$lib/services/keyEnvelopeService";
  import { adoptServerStorageIfLocalEmpty } from "$lib/services/storageModeSwitch";

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
  /**
   * Whether to show the codes.
   *
   * Separate from the codes themselves: the backup codes are minted several
   * steps before the screen that shows them, and must not appear while the
   * sign-in is still finishing.
   */
  let showSetupCodes = false;
  /**
   * Signed in, but with nothing that opens the vault.
   *
   * A passkey without PRF authenticates and yields no key material, so a
   * passkey-plus-authenticator sign-in gets through the door and no further.
   */
  let vaultLocked: AuthStep | null = null;
  /**
   * Both factors are in and the vault is being opened.
   *
   * Rendered ahead of everything else, because "signed in, working" used to
   * match no branch at all and fall through to the login form — for exactly as
   * long as Argon2id took, which read as a sign-in that had failed and then
   * inexplicably succeeded.
   */
  let isFinishing = false;
  /** The account being signed in, for the panel that says so. */
  let finishingEmail = "";
  const canUsePasskeys = passkeysSupported();
  /**
   * The PRF secret from a passkey assertion, held until the vault is opened.
   *
   * A passkey that supports PRF can unwrap the data key, which is what makes
   * a passkey-plus-authenticator sign-in work without the password at all.
   */
  let passkeyUnwrap: { credentialIdB64: string; prfOutput: Uint8Array } | null = null;
  /**
   * True only once the server has accepted `password` in this sign-in.
   *
   * The form field can hold text that was never submitted — typed, then the
   * passkey button used instead. Opening the vault with that would at best fail
   * and, on an account that has no key envelope yet, run the migration with an
   * unchecked password and seal a wrong data key over every existing record.
   */
  let passwordVerified = false;
  /**
   * The step whose passkey prompt was already started automatically. One
   * attempt per step: a cancelled prompt must leave the chooser alone, not
   * pop up again.
   */
  let passkeyAutoTriedFor: AuthStep | null = null;
  let passkeyPending = false;
  /**
   * A PRF passkey that signed in but could not open the vault: no wrap was
   * stored for it, or the stored one does not open. Once the vault is open by
   * another route, a fresh wrap is written so the passkey works alone next time.
   */
  let passkeyToHeal: { credentialIdB64: string; prfOutput: Uint8Array } | null = null;

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
    passwordVerified = false;
    passkeyUnwrap = null;
    passkeyToHeal = null;
    try {
      // Starting a sign-in invalidates the session the browser had: the server
      // demotes the access cookie to a pending scope and clears the refresh
      // cookie. Client state has to follow, or an already-unlocked tab keeps
      // rendering the app and every authenticated request it makes comes back
      // 403 — which is exactly what a back-navigation to /unlock produced.
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

  /**
   * Act on whatever the server said about the sign-in.
   *
   * Three outcomes, mirroring the policy: the account needs to enrol before it
   * can authenticate at all; another factor is outstanding; or two distinct
   * factors are in and the vault can be opened.
   */
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
      const unwrap = passkeyUnwrap;
      passkeyUnwrap = null;
      try {
        vault = await openWithPasskey(step.id, unwrap.credentialIdB64, unwrap.prfOutput);
      } catch (passkeyErr) {
        // A PRF passkey with no usable wrap: none was stored (the registration
        // never got its follow-up assertion, or PRF only showed up at sign-in),
        // or the stored one was sealed under another passkey's secret. Signed in
        // all the same — fall back to the password if the server checked it,
        // else ask, and re-wrap for this passkey once the vault is open.
        // A changed envelope set is the substitution alarm and must surface.
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
      // Nothing here can open the vault: the passkey carried no PRF secret and
      // no password was typed. Asking is the only honest move — unwrapping with
      // an empty string used to throw, and the failure surfaced as "that code is
      // not valid" about a code that was correct.
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

  /**
   * Leave the sign-in screen for an authenticated session. An empty local
   * workspace switches to server storage first, so the account's exams show up
   * instead of an empty local vault; local data is never switched away silently.
   */
  async function enterApp() {
    await adoptServerStorageIfLocalEmpty();
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

  /**
   * Sign in with a passkey.
   *
   * Works in either factor position: the server adds `passkey` to whatever the
   * sign-in has already collected. Where the authenticator supports PRF the
   * assertion also yields the secret that opens the vault, so a
   * passkey-plus-authenticator sign-in never needs the password.
   */
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
        // Same reason as in handleUnlock: the sign-in about to start demotes the
        // cookie, so the previous session's client state cannot stay live. Not
        // when a sign-in is already running — that would lock away the state the
        // step in progress is building on.
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

  /**
   * A passkey is the preferred second factor: when the account has one, its
   * prompt opens by itself. Cancelling it leaves the chooser, where the
   * authenticator (or the passkey again) can be picked.
   */
  $: if (
    authStep &&
    authStep.status === "factor_required" &&
    authStep.available.includes("passkey") &&
    canUsePasskeys &&
    !isLoading &&
    passkeyAutoTriedFor !== authStep
  ) {
    passkeyAutoTriedFor = authStep;
    void handlePasskey({ auto: true });
  }

  /** Passkey first, and only what this browser can actually present. */
  $: chooserFactors = authStep
    ? [...authStep.available]
        .filter((f) => f !== "passkey" || canUsePasskeys)
        .sort((a, b) => Number(b === "passkey") - Number(a === "passkey"))
    : [];

  /**
   * Message for a failure that happened *after* the server accepted the factor.
   *
   * Returns null when the failure was the factor itself. Everything used to
   * collapse into "that code is not valid", which is how a key problem wore the
   * costume of a credential problem — a correct password reported as wrong
   * because the browser could not load Argon2 to open the wrap with.
   */
  function vaultFailureMessage(err: unknown): string | null {
    if (err instanceof Argon2UnavailableError) {
      return translate("security.vaultUnlock.kdfUnavailable");
    }
    if (err instanceof EnvelopeChangedError) {
      return translate("security.envelope.changedBody");
    }
    return null;
  }

  /**
   * The password as the second factor.
   *
   * Kept in `password` like the first-position one, because `openVault` needs
   * it to unwrap the data key once the session is real.
   */
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

  /**
   * Unwrap the vault with the recovery code instead.
   *
   * Deliberately no re-wrap, unlike `handleRecovery`: that path follows a reset
   * where the password wrap is genuinely stale and a new password has just been
   * chosen. Here the wraps are all fine and no password was typed, so rewrapping
   * would seal the account under an empty string.
   */
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

  /**
   * Enrollment finished. The account now has two factors, so replay the
   * password to turn the enrollment token into a real session — the password is
   * still in hand, which is exactly what storing the key for the first time
   * needs.
   */
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
      // Unlocking deliberately does not change the configured storage mode —
      // that only happens through the gated switch, which exports first.
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
    showSetupCodes = true;
  }

  /**
   * Open the vault with a passkey instead of the recovery code.
   *
   * A reset invalidates only the password wrap, so a PRF passkey still holds the
   * same data key. For anyone who has one this recovers everything, which is why
   * it is offered before the route that gives the old data up.
   */
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

  /**
   * Give up the old data key and start again under the current password.
   *
   * The last resort for a teacher whose password was reset and whose recovery
   * code is gone — until this existed the dialog had no exit and the account was
   * simply unusable. Irreversible, and the dialog says so in those terms before
   * calling this.
   */
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
</script>

<PageShell width="medium" class="flex min-h-full flex-col justify-center gap-4">
  <!--
    Above the step rather than inside one: the cooloff can be hit from the form,
    from the second factor and from the vault prompt alike, and it is the same
    wait in every case.
  -->
  <LockoutNotice />

  {#if isFinishing}
    <Card class="mx-auto w-full max-w-form sm:p-6">
      <SigningInStep email={finishingEmail} />
    </Card>
  {:else if authStep && authStep.status === "factor_required"}
    <!--
      One factor is in. The password stays in memory until the vault is open,
      so this step is rendered in place of the form rather than on a new route.
    -->
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
      bind:localPassphrase
      bind:localPassphraseConfirm
      {isNewLocalVault}
      {needsLegacyMigration}
      {errorMsg}
      {isLoading}
      onUnlock={handleUnlock}
      onUnlockLocal={handleUnlockLocal}
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
