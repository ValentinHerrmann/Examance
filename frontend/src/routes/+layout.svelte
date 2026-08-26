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
    displayVersionUrl,
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
    formatImportSummary,
  } from "$lib/services/archiveService";
  import AppHeader from "$lib/components/layout/AppHeader.svelte";
  import StatusBar from "$lib/components/layout/StatusBar.svelte";
  import StoragePolicyModal from "$lib/components/StoragePolicyModal.svelte";
  import SessionTimeoutWarning from "$lib/components/SessionTimeoutWarning.svelte";
  import HttpCatModal from "$lib/components/HttpCatModal.svelte";
  import HelpModal from "$lib/components/help/HelpModal.svelte";
  import { helpSeen, openHelp, toggleHelp } from "$lib/stores/helpStore";
  import { locale, translate } from "$lib/i18n";

  let fileInput: HTMLInputElement;
  let isSettingsModalOpen = false;
  let isWorkspaceMenuOpen = false;
  let isInitializing = true;
  let showFocusNav = false;

  $: isGradeActive = isGradeActivePath($page.url.pathname);

  // app.html ships a static <html lang="en">; keep it truthful so screen
  // readers and browser translation follow the selected language.
  $: if (typeof document !== "undefined") {
    document.documentElement.lang = $locale;
  }

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

  /**
   * F1 and "?" open the help panel. Both are ignored while the caret is in a
   * text field — "?" is a perfectly ordinary character in a LaTeX body.
   */
  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.closest(".cm-editor") !== null)
    ) {
      return;
    }
    if (event.key === "F1" || event.key === "?") {
      event.preventDefault();
      toggleHelp();
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

    const password = promptArchivePassword(translate("workspace.archive.promptImportPassword"));
    if (!password) {
      input.value = "";
      return;
    }

    try {
      const res = await openBgprojArchive(file, password);
      alert(formatImportSummary(res));
      window.location.href = "/";
    } catch (err: any) {
      alert(translate("workspace.archive.importFailed", { message: err.message }));
    } finally {
      input.value = "";
    }
  }

  async function handleExportBgproj() {
    const password = promptArchivePassword(translate("workspace.archive.promptExportPassword"));
    if (!password) return;

    try {
      await exportBgprojArchive(password);
    } catch (err: any) {
      alert(translate("workspace.archive.exportFailed", { message: err.message }));
    }
  }

  async function handleCloseWorkspace() {
    if (!confirmWorkspaceClear()) {
      return;
    }

    try {
      await clearWorkspace();
      alert(translate("workspace.archive.cleared"));
      window.location.href = "/";
    } catch (err: any) {
      alert(translate("workspace.archive.clearFailed", { message: err.message }));
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

<svelte:window on:keydown={handleGlobalKeydown} />

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

  <StatusBar
    onStorageClick={handleFooterClick}
    onHelpClick={() => openHelp()}
    helpUnseen={!$helpSeen}
    policyIcon={$storagePolicyBadgeStore.icon}
    policyLabel={$storagePolicyLabelStore}
    backendLabel={$effectiveBackendStore || ""}
    unlocked={$isUnlocked}
    {frontendVersion}
    versionUrl={$displayVersionUrl}
    backendVersion={$backendVersionStore}
    versionStatus={$versionStatus}
  />

  <HelpModal />

  <StoragePolicyModal
    isOpen={isSettingsModalOpen}
    on:close={() => (isSettingsModalOpen = false)}
  />
</div>

