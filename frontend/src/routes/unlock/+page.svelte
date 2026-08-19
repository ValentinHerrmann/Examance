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

  const LOCAL_PASSPHRASE_MIN_LENGTH = 12;

  let password = "";
  let email = "";
  let backendUrl = get(backendStore);
  let errorMsg = "";
  let isLoading = false;

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

      // Derive local session keys deterministically from user email & password
      const salt = await getUserSalt(normalizedEmail);
      const { masterKey, fallbackMasterKey } = await deriveKeyWithFallback(password, salt);
      const sessionNonce = await getUserSessionNonce(normalizedEmail);
      const sessionKey = await deriveSessionKey(masterKey, sessionNonce);
      const fallbackSessionKey = fallbackMasterKey
        ? await deriveSessionKey(fallbackMasterKey, sessionNonce)
        : null;

      sessionStore.unlock({
        masterKey,
        sessionKey,
        fallbackSessionKey,
        sessionNonce,
        email: user.email,
        role: user.role,
        mode: "authenticated",
      });

      // Redirect to Dashboard
      await goto("/");
    } catch (err: any) {
      // Revert store to last saved URL if authentication failed
      backendStore.restoreSavedUrl();
      if (err instanceof ApiError && err.code === 'ERR_PASSWORD_NOT_SET') {
        errorMsg = translate("auth.unlock.errors.passwordNotSet");
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
</script>

<div class="unlock-container">
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
