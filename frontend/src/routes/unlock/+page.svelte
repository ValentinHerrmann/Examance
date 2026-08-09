<script lang="ts">
  import "./+page.css";
  import { goto } from "$app/navigation";
  import { deriveKey, deriveKeyWithFallback, generateSalt, getUserSalt, getUserSessionNonce } from "$lib/crypto/keyDerivation";
  import {
    deriveSessionKey,
    generateSessionNonce,
  } from "$lib/crypto/sessionKey";
  import { sessionStore } from "$lib/stores/session";
  import { api } from "$lib/api/client";
  import { backendStore } from "$lib/stores/backendStore";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { get } from "svelte/store";
  import UnlockForm from "$lib/components/unlock/UnlockForm.svelte";

  let password = "";
  let email = "";
  let backendUrl = get(backendStore);
  let errorMsg = "";
  let isLoading = false;

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

    // Set transient backend URL for authentication attempt
    backendStore.setTransient(trimmedBackendUrl);

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
      errorMsg =
        err.message || "Unlock failed. Check your password or credentials.";
    } finally {
      isLoading = false;
    }
  }

  async function handleUnlockLocal() {
    errorMsg = "";
    isLoading = true;
    try {
      storagePolicyStore.updateSetting("storageMode", "all-local");
      await sessionStore.initAnonymousSession(true);
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
    {errorMsg}
    {isLoading}
    onUnlock={handleUnlock}
    onUnlockLocal={handleUnlockLocal}
  />
</div>
