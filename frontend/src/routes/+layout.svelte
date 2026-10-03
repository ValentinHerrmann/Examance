<script lang="ts">
  import "../app.css";
  import "./+layout.css";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { registerHygieneListeners, lockSession } from "$lib/db/hygiene";
  import {
    sessionStore,
    isUnlocked,
    isAuthenticated,
    markSessionReady,
  } from "$lib/stores/session";
  import { vaultIntegrityStore } from "$lib/stores/vaultIntegrity";
  import { api } from "$lib/api/client";
  import {
    storagePolicyStore,
    storagePolicyBadgeStore,
  } from "$lib/stores/storagePolicy";
  import { safeLocalStorage } from "$lib/utils/storage";
  import { registerCspDiagnostics } from "$lib/utils/cspDiagnostics";
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
    importArchiveInteractively,
    exportArchiveInteractively,
    clearWorkspace,
    confirmWorkspaceClear,
  } from "$lib/services/archiveService";
  import ImportConflictModal from "$lib/components/storage/ImportConflictModal.svelte";
  import StorageModeSwitchWizard from "$lib/components/storage/StorageModeSwitchWizard.svelte";
  import { adoptServerStorageIfLocalEmpty, pendingSwitchStore, resumeModeSwitch } from "$lib/services/storageModeSwitch";
  import AppNavbar from "$lib/components/layout/AppNavbar.svelte";
  import AppFooter from "$lib/components/layout/AppFooter.svelte";
  import NavDrawer from "$lib/components/layout/NavDrawer.svelte";
  import ExamSidebar from "$lib/components/layout/ExamSidebar.svelte";
  import { examNavContext } from "$lib/stores/shell";
  import { theme, applyTheme } from "$lib/stores/theme";
  import { Alert, Button } from "$lib/components/ui";
  import StoragePolicyModal from "$lib/components/StoragePolicyModal.svelte";
  import SessionTimeoutWarning from "$lib/components/SessionTimeoutWarning.svelte";
  import HttpCatModal from "$lib/components/HttpCatModal.svelte";
  import HelpModal from "$lib/components/help/HelpModal.svelte";
  import { helpSeen, helpStore, openHelp, toggleHelp } from "$lib/stores/helpStore";
  import { locale, t, translate } from "$lib/i18n";

  let fileInput: HTMLInputElement;
  let isSettingsModalOpen = false;
  let isInitializing = true;
  let showFocusNav = false;

  // A mode switch interrupted after its wipe: say why the workspace is empty.
  let switchWizardOpen = false;
  let resumeBannerDismissed = false;
  $: interruptedSwitch =
    $pendingSwitchStore && $pendingSwitchStore.phase === "reimport" ? $pendingSwitchStore : null;

  $: isGradeActive = isGradeActivePath($page.url.pathname);

  // The inline script in app.html applied the theme before the first paint;
  // from here on the store keeps <html data-theme> in step with the user's
  // choice and with OS changes while "system" is selected.
  $: if (typeof document !== "undefined") {
    applyTheme($theme);
  }

  $: showFullNav = $isUnlocked && $page.url.pathname !== "/unlock";
  $: showExamSidebar =
    showFullNav && !!$examNavContext && $page.url.pathname.startsWith(`/exam/${$examNavContext.examId}`);

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
    // F1 is not a printable character: while the help panel is open (its
    // search field takes focus on open) it must still close it.
    const closesHelp = event.key === "F1" && get(helpStore).open;
    if (
      !closesHelp &&
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
    // Before hygiene, so a violation during boot is still explained.
    registerCspDiagnostics();
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
      // Same rule as sign-in, before routes read: an empty local workspace shows
      // the account's server data rather than an empty local vault.
      if (mode === "authenticated") await adoptServerStorageIfLocalEmpty();

      // Keys are back — all `awaitSessionReady()` gates on — so release
      // routes here, before the token refresh below (that refresh is about
      // the access cookie, not the vault; `client.ts` already handles a race
      // with an unrefreshed token).
      markSessionReady();

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
    // Releases every route blocked on `awaitSessionReady()`, whether or not
    // the session came back unlocked — routes check `isUnlocked` themselves.
    markSessionReady();

    resumeModeSwitch(); // re-arms a switch a reload interrupted
  });

  async function handleLock() {
    await lockSession();
    window.location.href = "/unlock";
  }

  function triggerOpenBgproj() {
    fileInput?.click();
  }

  async function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file && (await importArchiveInteractively(file))) window.location.href = "/";
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
  {#if !showFullNav}
    <AppNavbar variant="minimal" helpUnseen={!$helpSeen} onHelpClick={() => openHelp()} />
  {:else if !isGradeActive || showFocusNav}
    <AppNavbar
      authenticated={$isAuthenticated}
      userRole={$sessionStore.role}
      userEmail={$sessionStore.email}
      storageMode={$storagePolicyStore.storageMode}
      storageLabel={$storagePolicyBadgeStore.text}
      storageTitle={$storagePolicyBadgeStore.title}
      versionStatus={$versionStatus}
      helpUnseen={!$helpSeen}
      onStorageClick={handleFooterClick}
      onHelpClick={() => openHelp()}
      onOpenArchive={triggerOpenBgproj}
      onExportArchive={() => exportArchiveInteractively()}
      onClearWorkspace={handleCloseWorkspace}
      onLock={handleLock}
    />
  {/if}

  {#if $versionStatus === "incompatible"}
    <!-- A differing major version means frontend and backend disagree on the
         API; saving may fail. Not dismissible, and visible without scrolling. -->
    <Alert severity="danger" title={$t("statusBar.incompatibleTitle")} class="mx-3 mt-2 sm:mx-4">
      {$t("statusBar.incompatibleBody", { app: frontendVersion, server: $backendVersionStore ?? "?" })}
    </Alert>
  {/if}

  {#if interruptedSwitch && !resumeBannerDismissed}
    <Alert severity="warning" title={$t("storagePolicy.switch.resumeBanner")} class="mx-3 mt-2 sm:mx-4">
      {$t("storagePolicy.switch.resumeBody", {
        to: $storagePolicyBadgeStore.text,
      })}
      <svelte:fragment slot="actions">
        <Button variant="outlined" severity="warning" size="sm" onClick={() => (switchWizardOpen = true)}>
          {$t("storagePolicy.switch.resumeContinue")}
        </Button>
        <Button variant="text" severity="secondary" size="sm" onClick={() => (resumeBannerDismissed = true)}>
          {$t("storagePolicy.switch.resumeDismiss")}
        </Button>
      </svelte:fragment>
    </Alert>
  {/if}

  {#if $vaultIntegrityStore.count > 0}
    <!--
      Not a toast or the HTTP error modal: until unlocked with the right key,
      affected records render blank, so this stays on screen next to them.
    -->
    <Alert severity="danger" title={$t("misc.vaultIntegrity.heading")} class="mx-3 mt-2 sm:mx-4">
      {$t("misc.vaultIntegrity.body", {
        count: $vaultIntegrityStore.count,
        kinds: $vaultIntegrityStore.kinds.join(", "),
      })}
      <svelte:fragment slot="actions">
        <Button variant="outlined" severity="danger" size="sm" onClick={handleLock}>
          {$t("misc.vaultIntegrity.action")}
        </Button>
        <Button variant="text" severity="secondary" size="sm" onClick={() => vaultIntegrityStore.reset()}>
          {$t("misc.vaultIntegrity.dismiss")}
        </Button>
      </svelte:fragment>
    </Alert>
  {/if}

  <div class="app-body">
    {#if showExamSidebar && $examNavContext}
      <ExamSidebar context={$examNavContext} pathname={$page.url.pathname} {isGradeActive} />
    {/if}

    <main class="app-main">
      <slot />

      <AppFooter
        onBackendClick={handleFooterClick}
        backendLabel={$effectiveBackendStore || ""}
        unlocked={$isUnlocked}
        {frontendVersion}
        versionUrl={$displayVersionUrl}
        backendVersion={$backendVersionStore}
        versionStatus={$versionStatus}
      />
    </main>
  </div>

  {#if showFullNav}
    <NavDrawer userRole={$sessionStore.role} />
  {/if}

  <HelpModal />

  <StoragePolicyModal
    isOpen={isSettingsModalOpen}
    on:close={() => (isSettingsModalOpen = false)}
  />
</div>

<StorageModeSwitchWizard
  open={switchWizardOpen}
  target={null}
  onClose={() => (switchWizardOpen = false)}
/>

<ImportConflictModal />
