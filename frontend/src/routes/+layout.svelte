<script lang="ts">
  import "../app.css";
  import "./+layout.css";
  import { onMount, untrack, type Snippet } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { registerHygieneListeners, lockSession } from "#lib/db/hygiene";
  import {
    sessionStore,
    isUnlocked,
    isAuthenticated,
    markSessionReady,
  } from "#lib/stores/session";
  import { vaultIntegrityStore } from "#lib/stores/vaultIntegrity";
  import { api } from "#lib/api/client";
  import {
    storagePolicyStore,
    storagePolicyBadgeStore,
  } from "#lib/stores/storagePolicy";
  import { safeLocalStorage } from "#lib/utils/storage";
  import { registerCspDiagnostics } from "#lib/utils/cspDiagnostics";
  import { effectiveBackendStore } from "#lib/stores/backendStore";
  import {
    frontendVersion,
    displayVersionUrl,
    backendVersionStore,
    versionStatus,
    refreshBackendVersion,
  } from "#lib/stores/versionStore";
  import { registerNavigationGuard, isGradeActivePath, isPublicPath } from "#lib/stores/navigationStore";
  import {
    importArchiveInteractively,
    exportArchiveInteractively,
    clearWorkspace,
    confirmWorkspaceClear,
  } from "#lib/services/archiveService";
  import ImportConflictModal from "#lib/components/storage/ImportConflictModal.svelte";
  import StorageModeSwitchWizard from "#lib/components/storage/StorageModeSwitchWizard.svelte";
  import { pendingSwitchStore, resumeModeSwitch } from "#lib/services/storageModeSwitch";
  import { loadWorkspace, openWorkspace } from "#lib/db/workspace";
  import { workspaceStatusStore } from "#lib/stores/workspaceState";
  import { registerWorkspaceSync, switchRunningElsewhere } from "#lib/stores/workspaceSync";
  import WorkspaceBlocked from "#lib/components/storage/WorkspaceBlocked.svelte";
  import AppNavbar from "#lib/components/layout/AppNavbar.svelte";
  import AppFooter from "#lib/components/layout/AppFooter.svelte";
  import NavDrawer from "#lib/components/layout/NavDrawer.svelte";
  import ExamSidebar from "#lib/components/layout/ExamSidebar.svelte";
  import { examNavContext } from "#lib/stores/shell";
  import { theme, applyTheme } from "#lib/stores/theme";
  import { Alert, Button, PageShell } from "#lib/components/ui";
  import StoragePolicyModal from "#lib/components/StoragePolicyModal.svelte";
  import SessionTimeoutWarning from "#lib/components/SessionTimeoutWarning.svelte";
  import HttpCatModal from "#lib/components/HttpCatModal.svelte";
  import HelpModal from "#lib/components/help/HelpModal.svelte";
  import { helpSeen, helpStore, openHelp, toggleHelp } from "#lib/stores/helpStore";
  import { locale, t, translate } from "#lib/i18n";

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let isSettingsModalOpen = $state(false);
  let isInitializing = $state(true);
  let showFocusNav = false;

  // A mode switch interrupted after its wipe: say why the workspace is empty.
  let switchWizardOpen = $state(false);
  let resumeBannerDismissed = $state(false);
  let interruptedSwitch = $derived(
    $pendingSwitchStore && $pendingSwitchStore.phase === "reimport" ? $pendingSwitchStore : null,
  );

  let isGradeActive = $derived(isGradeActivePath(page.url.pathname));

  let showFullNav = $derived($isUnlocked && page.url.pathname !== "/unlock");
  let showExamSidebar = $derived(
    showFullNav && !!$examNavContext && page.url.pathname.startsWith(`/exam/${$examNavContext.examId}`),
  );

  function handleFooterClick() {
    if (get(isUnlocked)) {
      isSettingsModalOpen = true;
    } else {
      window.location.href = "/unlock";
    }
  }

  /** F1 and "?" open help; both are ignored in text fields ("?" is ordinary in a LaTeX body). */
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
    registerWorkspaceSync();
    // The manifest in IndexedDB is the source of truth for the mode; this refreshes the
    // localStorage cache the stores booted from before anything routes a request.
    try {
      await loadWorkspace();
    } catch (err) {
      console.error("[layout] could not load the workspace manifest", err);
    }

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
      // Before routes read: the session must own this browser's workspace (owner binding, see
      // lib/db/workspace.ts). A reload never changes the mode; only an explicit sign-in may adopt
      // server storage, and only on a pristine workspace.
      await openWorkspace();

      // Keys are back, so release `awaitSessionReady()` routes before the token refresh below
      // (that refresh is about the access cookie, not the vault; `client.ts` handles the race).
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
    } else if (!get(isUnlocked) && !isPublicPath(page.url.pathname)) {
      // Local mode no longer auto-unlocks: its keys come from a passphrase the
      // user supplies, and nothing derived from it is persisted. Every locked
      // session therefore goes through /unlock, whichever mode it is in.
      await goto("/unlock");
    }
    isInitializing = false;
    // Releases every route blocked on `awaitSessionReady()`, whether or not
    // the session came back unlocked — routes check `isUnlocked` themselves.
    markSessionReady();

    await resumeModeSwitch(); // picks up a switch a reload interrupted
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

  // The inline script in app.html applied the theme before the first paint;
  // from here on the store keeps <html data-theme> in step with the user's
  // choice and with OS changes while "system" is selected.
  $effect.pre(() => {
    const currentTheme = $theme;
    if (typeof document !== "undefined") {
      untrack(() => applyTheme(currentTheme));
    }
  });

  // app.html ships a static <html lang="en">; keep it truthful so screen
  // readers and browser translation follow the selected language.
  $effect.pre(() => {
    const lang = $locale;
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  });

  // Re-probe the server's version whenever the address changes or the session
  // unlocks. `refreshBackendVersion` de-duplicates concurrent calls, so the
  // overlap with the onMount call below is harmless.
  $effect.pre(() => {
    const backend = $effectiveBackendStore;
    const unlocked = $isUnlocked;
    if (typeof window !== "undefined" && (backend || unlocked)) {
      untrack(() => void refreshBackendVersion());
    }
  });

  $effect.pre(() => {
    const initializing = isInitializing;
    const unlocked = $isUnlocked;
    const pathname = page.url.pathname;
    if (!initializing && !unlocked && typeof window !== "undefined" && !isPublicPath(pathname)) {
      untrack(() => goto("/unlock"));
    }
  });
</script>

<input
  type="file"
  accept=".bgproj"
  style="display: none"
  bind:this={fileInput}
  onchange={handleFileSelected}
/>

<svelte:window onkeydown={handleGlobalKeydown} />

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
      latexCompilation={$storagePolicyStore.latexCompilation}
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
      {#snippet actions()}
        <Button variant="outlined" severity="warning" size="sm" onClick={() => (switchWizardOpen = true)}>
          {$t("storagePolicy.switch.resumeContinue")}
        </Button>
        <Button variant="text" severity="secondary" size="sm" onClick={() => (resumeBannerDismissed = true)}>
          {$t("storagePolicy.switch.resumeDismiss")}
        </Button>
      {/snippet}
    </Alert>
  {/if}

  {#if $vaultIntegrityStore.count > 0}
    <!-- Not a toast: until unlocked with the right key, affected records render blank, so this stays. -->
    <Alert severity="danger" title={$t("misc.vaultIntegrity.heading")} class="mx-3 mt-2 sm:mx-4">
      {$t("misc.vaultIntegrity.body", {
        count: $vaultIntegrityStore.count,
        kinds: $vaultIntegrityStore.kinds.join(", "),
      })}
      {#snippet actions()}
        <Button variant="outlined" severity="danger" size="sm" onClick={handleLock}>
          {$t("misc.vaultIntegrity.action")}
        </Button>
        <Button variant="text" severity="secondary" size="sm" onClick={() => vaultIntegrityStore.reset()}>
          {$t("misc.vaultIntegrity.dismiss")}
        </Button>
      {/snippet}
    </Alert>
  {/if}

  <div class="app-body">
    {#if showExamSidebar && $examNavContext}
      <ExamSidebar context={$examNavContext} pathname={page.url.pathname} {isGradeActive} />
    {/if}

    <main class="app-main">
      {#if $workspaceStatusStore.state === "blocked" && page.url.pathname !== "/unlock"}
        <!-- Routes stay unmounted: they would read a vault this session does not own. -->
        <PageShell width="medium" center>
          <WorkspaceBlocked reason={$workspaceStatusStore.reason} />
        </PageShell>
      {:else}
        {@render children?.()}
      {/if}

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
    onClose={() => (isSettingsModalOpen = false)}
  />
</div>

{#if $switchRunningElsewhere}
  <!-- Another tab is replacing the workspace; anything done here would land in the wrong store. -->
  <div
    class="fixed inset-0 flex items-center justify-center bg-surface-base/90 p-4 backdrop-blur-sm"
    style="z-index: var(--z-modal)"
    role="alertdialog"
    aria-live="assertive"
    aria-label={$t("storagePolicy.workspace.switchElsewhereTitle")}
  >
    <div class="max-w-narrow space-y-2 rounded-xl border border-line bg-surface-raised p-6 text-center shadow-lg">
      <h2 class="text-lg font-semibold text-content">{$t("storagePolicy.workspace.switchElsewhereTitle")}</h2>
      <p class="text-sm text-muted">{$t("storagePolicy.workspace.switchElsewhereBody")}</p>
    </div>
  </div>
{/if}

<StorageModeSwitchWizard
  open={switchWizardOpen}
  target={null}
  onClose={() => (switchWizardOpen = false)}
/>

<ImportConflictModal />
