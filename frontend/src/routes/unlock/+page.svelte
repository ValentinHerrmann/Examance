<script lang="ts">
  import "./+page.css";
  import { goto } from "$app/navigation";
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
  import { api } from "$lib/api/client";
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
      errorMsg = "Please enter a server address.";
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      errorMsg = "Please enter your email.";
      return;
    }
    if (!password) {
      errorMsg = "Please enter your password.";
      return;
    }

    // Set transient backend URL for authentication attempt. Validated before
    // use — credentials are about to be posted to whatever this points at.
    try {
      backendStore.setTransient(trimmedBackendUrl);
    } catch (err: any) {
      errorMsg = err?.message ?? "That backend server address is not valid.";
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
      });

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
      // "Failed to fetch" is the browser's opaque network error for CORS
      // preflight rejections. Give users a concrete hint.
      const raw: string = err.message || '';
      errorMsg =
        raw === 'Failed to fetch'
          ? 'Could not reach the server. If you are using a local backend, make sure it is running and has CORS enabled for this origin.'
          : raw || 'Unlock failed. Check your password or credentials.';
    } finally {
      isLoading = false;
    }
  }

  async function handleUnlockLocal() {
    errorMsg = "";

    if (!localPassphrase) {
      errorMsg = "Please enter a passphrase for your local workspace.";
      return;
    }
    if (isNewLocalVault || needsLegacyMigration) {
      if (localPassphrase.length < LOCAL_PASSPHRASE_MIN_LENGTH) {
        errorMsg = `Passphrase must be at least ${LOCAL_PASSPHRASE_MIN_LENGTH} characters.`;
        return;
      }
      if (localPassphrase !== localPassphraseConfirm) {
        errorMsg = "The two passphrases do not match.";
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
      errorMsg = err?.message || "Failed to initialize local session.";
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
