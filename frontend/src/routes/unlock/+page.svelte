<script lang="ts">
  import "./+page.css";
  import { goto } from "$app/navigation";
  import { translate } from "$lib/i18n";
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
  import { RecoveryCodeDialog, RecoveryUnlockDialog } from "$lib/components/security";
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
      // Authenticate with server to get httpOnly cookies
      const user = await api.post<{
        id: string;
        email: string;
        role: "teacher" | "admin";
      }>("/auth/login", {
        email: normalizedEmail,
        password,
      }, { silentError: true });

      // Save backend URL to localStorage ONLY after successful login
      backendStore.saveSuccessfulBackendUrl(trimmedBackendUrl);
      recordValue("backend.url", trimmedBackendUrl);

      // Persist server mode configuration in browser if previously set to all-local
      if (get(storagePolicyStore).storageMode === "all-local") {
        storagePolicyStore.updateSetting("storageMode", "all-server");
      }

      // Recover the data key from its wrapped copy on the server. On an account
      // that predates the envelope this performs the one-time migration, which
      // adopts the previously derived key as the data key — so nothing has to be
      // re-encrypted and the session key below is byte-identical to the old one.
      let vault;
      try {
        vault = await openWithPassword(user.id, normalizedEmail, password);
      } catch (envelopeErr) {
        if (envelopeErr instanceof EnvelopeFactorMissingError) {
          // The password is correct — the server accepted it — but it no longer
          // opens the stored key. That is what a reset leaves behind, and the
          // recovery code is the way out of it.
          pendingRecovery = {
            teacherId: user.id,
            email: user.email,
            role: user.role,
          };
          return;
        }
        throw envelopeErr;
      }

      const keys = await materializeSession(vault, normalizedEmail);

      sessionStore.unlock({
        ...keys,
        email: user.email,
        role: user.role,
        mode: "authenticated",
      });

      if (vault.newRecoveryCode) {
        // Shown once, and the dashboard waits until it is acknowledged: this is
        // the only copy of the factor that always works.
        pendingRecoveryCode = vault.newRecoveryCode;
        return;
      }

      // Redirect to Dashboard
      await goto("/");
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
      role,
      mode: "authenticated",
    });

    pendingRecovery = null;
    // The code just used is spent; the replacement is shown once.
    pendingRecoveryCode = newCode;
  }
</script>

<div class="unlock-container flex min-h-full flex-col items-center justify-center box-border px-4 py-8 sm:px-6 sm:py-12">
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
</div>

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
