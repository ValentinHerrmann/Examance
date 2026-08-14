<script lang="ts">
  import "../app.css";
  import "./+layout.css";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { registerHygieneListeners, lockSession } from "$lib/db/hygiene";
  import { sessionStore, isUnlocked, isAuthenticated } from "$lib/stores/session";
  import { api } from "$lib/api/client";
  import {
    storagePolicyStore,
    storagePolicyLabelStore,
    storagePolicyBadgeStore,
  } from "$lib/stores/storagePolicy";
  import { safeLocalStorage } from "$lib/utils/storage";
  import { effectiveBackendStore } from "$lib/stores/backendStore";
  import {
    frontendVersion,
    backendVersionStore,
    versionStatus,
    refreshBackendVersion,
  } from "$lib/stores/versionStore";
  import { registerNavigationGuard, isGradeActivePath, isPublicPath } from "$lib/stores/navigationStore";
  import {
    openBgprojArchive,
    exportBgprojArchive,
    clearWorkspace,
    confirmWorkspaceReplace,
    confirmWorkspaceClear,
    promptArchivePassword,
  } from "$lib/services/archiveService";
  import AppHeader from "$lib/components/layout/AppHeader.svelte";
  import StatusBar from "$lib/components/layout/StatusBar.svelte";
  import StoragePolicyModal from "$lib/components/StoragePolicyModal.svelte";
  import SessionTimeoutWarning from "$lib/components/SessionTimeoutWarning.svelte";
  import HttpCatModal from "$lib/components/HttpCatModal.svelte";

  let fileInput: HTMLInputElement;
  let isSettingsModalOpen = false;
  let isWorkspaceMenuOpen = false;
  let isInitializing = true;
  let showFocusNav = false;

  $: isGradeActive = isGradeActivePath($page.url.pathname);

  // Re-probe the server's version whenever the address changes or the session
  // unlocks. `refreshBackendVersion` de-duplicates concurrent calls, so the
  // overlap with the onMount call below is harmless.
  $: if (typeof window !== "undefined" && ($effectiveBackendStore || $isUnlocked)) {
    void refreshBackendVersion();
  }

  $: if (!isInitializing && !$isUnlocked && typeof window !== "undefined" && !isPublicPath($page.url.pathname)) {
    goto("/unlock");
  }

  function handleFooterClick() {
    if (get(isUnlocked)) {
      isSettingsModalOpen = true;
    } else {
      window.location.href = "/unlock";
    }
  }

  registerNavigationGuard();

  onMount(async () => {
    registerHygieneListeners();

    let restored = false;
    if (!get(isUnlocked)) {
      restored = await sessionStore.restoreFromSessionStorage();
      if (!restored) {
        restored = await sessionStore.requestKeysFromOtherTabs(300);
      }
    } else {
      restored = true;
    }

    const isLockedInStorage =
      safeLocalStorage.getItem("bg_session_locked") === "true";

    const savedMode = safeLocalStorage.getItem("bg_session_mode");

    const policy = get(storagePolicyStore);

    if (restored && get(isUnlocked)) {
      const mode = get(sessionStore).mode;
      if (mode === "hybrid" || mode === "authenticated") {
        try {
          await api.post("/auth/refresh", undefined, { silentError: true });
        } catch {
          await lockSession();
          isInitializing = false;
          return;
        }
      }
    } else if (!get(isUnlocked) && !isPublicPath($page.url.pathname)) {
      // Local mode no longer auto-unlocks: its keys come from a passphrase the
      // user supplies, and nothing derived from it is persisted. Every locked
      // session therefore goes through /unlock, whichever mode it is in.
      await goto("/unlock");
    }
    isInitializing = false;
  });

  async function handleLock() {
    await lockSession();
    window.location.href = "/unlock";
  }

  function triggerOpenBgproj() {
    isWorkspaceMenuOpen = false;
    fileInput?.click();
  }

  async function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    if (!confirmWorkspaceReplace()) {
      input.value = "";
      return;
    }

    const password = promptArchivePassword("Enter password for this .bgproj archive:");
    if (!password) {
      input.value = "";
      return;
    }

    try {
      await openBgprojArchive(file, password);
      alert("Successfully imported project archive!");
      window.location.href = "/";
    } catch (err: any) {
      alert(`Failed to import archive: ${err.message}`);
    } finally {
      input.value = "";
    }
  }

  async function handleExportBgproj() {
    const password = promptArchivePassword("Enter password to encrypt .bgproj archive:");
    if (!password) return;

    try {
      await exportBgprojArchive(password);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  }

  async function handleCloseWorkspace() {
    if (!confirmWorkspaceClear()) {
      return;
    }

    try {
      await clearWorkspace();
      alert("Workspace cleared successfully.");
      window.location.href = "/";
    } catch (err: any) {
      alert(`Failed to clear workspace: ${err.message}`);
    }
  }
</script>

<input
  type="file"
  accept=".bgproj"
  style="display: none"
  bind:this={fileInput}
  on:change={handleFileSelected}
/>

<SessionTimeoutWarning />
<HttpCatModal />

<div class="app-layout">
  {#if $isUnlocked && $page.url.pathname !== "/unlock"}
    {#if !isGradeActive || showFocusNav}
      <AppHeader
        bind:isWorkspaceMenuOpen
        onToggleWorkspaceMenu={() => (isWorkspaceMenuOpen = !isWorkspaceMenuOpen)}
        onOpenArchive={triggerOpenBgproj}
        onExportArchive={handleExportBgproj}
        onClearWorkspace={handleCloseWorkspace}
        onLock={handleLock}
        authenticated={$isAuthenticated}
        userRole={$sessionStore.role}
        userEmail={$sessionStore.email}
      />
    {/if}
  {/if}

  <main class="app-main">
    <slot />
  </main>

  <!-- § 5 DDG requires the Impressum to be reachable from every page. -->
  <nav class="legal-links" aria-label="Rechtliche Hinweise">
    <a href="/legal/impressum">Impressum</a>
    <span aria-hidden="true">·</span>
    <a href="/legal/datenschutz">Datenschutz</a>
  </nav>

  <StatusBar
    onStorageClick={handleFooterClick}
    policyIcon={$storagePolicyBadgeStore.icon}
    policyLabel={$storagePolicyLabelStore}
    backendLabel={$effectiveBackendStore || ""}
    unlocked={$isUnlocked}
    {frontendVersion}
    backendVersion={$backendVersionStore}
    versionStatus={$versionStatus}
  />

  <StoragePolicyModal
    isOpen={isSettingsModalOpen}
    on:close={() => (isSettingsModalOpen = false)}
  />
</div>

<style>
  .legal-links {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    color: #64748b;
  }

  .legal-links a {
    color: #94a3b8;
    text-decoration: none;
  }

  .legal-links a:hover {
    color: #e2e8f0;
    text-decoration: underline;
  }
</style>
