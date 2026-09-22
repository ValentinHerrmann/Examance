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
  import {
    vaultIntegrityStore,
    hasVaultIntegrityFailure,
  } from "$lib/stores/vaultIntegrity";
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
    confirmWorkspaceClear,
    promptArchivePassword,
    formatImportSummary,
  } from "$lib/services/archiveService";
  import ImportConflictModal from "$lib/components/storage/ImportConflictModal.svelte";
  import StorageModeSwitchWizard from "$lib/components/storage/StorageModeSwitchWizard.svelte";
  import type { ArchiveConflict, DecisionMap } from "$lib/archive/conflicts";
  import {
    isSwitchInProgress,
    pendingSwitchStore,
    resumeModeSwitch,
  } from "$lib/services/storageModeSwitch";
  import AppHeader from "$lib/components/layout/AppHeader.svelte";
  import StatusBar from "$lib/components/layout/StatusBar.svelte";
  import StoragePolicyModal from "$lib/components/StoragePolicyModal.svelte";
  import SessionTimeoutWarning from "$lib/components/SessionTimeoutWarning.svelte";
  import HttpCatModal from "$lib/components/HttpCatModal.svelte";
  import HelpModal from "$lib/components/help/HelpModal.svelte";
  import { helpSeen, openHelp, toggleHelp } from "$lib/stores/helpStore";
  import { locale, t, translate } from "$lib/i18n";

  let fileInput: HTMLInputElement;
  let isSettingsModalOpen = false;
  let isWorkspaceMenuOpen = false;
  let isInitializing = true;
  let showFocusNav = false;

  let conflictsOpen = false;
  let pendingConflicts: ArchiveConflict[] = [];
  let pendingIdenticalCount = 0;
  let resolveConflicts: ((decisions: DecisionMap) => void) | null = null;
  let rejectConflicts: ((reason: Error) => void) | null = null;

  /**
   * A mode switch that a reload interrupted. The wipe is irreversible, so the
   * workspace being empty afterwards needs a stated reason on screen rather
   * than looking like the data loss this whole change is about.
   */
  let switchWizardOpen = false;
  let resumeBannerDismissed = false;
  $: interruptedSwitch =
    $pendingSwitchStore && $pendingSwitchStore.phase === "reimport" ? $pendingSwitchStore : null;

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
      // The keys are back, which is all `awaitSessionReady()` gates on — so
      // release the routes here rather than behind the token refresh below.
      // The refresh is about the access cookie, not the vault, and making
      // every route wait on a network round-trip delayed the first render of
      // real data by a full request even in all-local mode, where no API call
      // was going to happen at all.
      //
      // An API call that races an unrefreshed token is already handled:
      // `client.ts` deduplicates concurrent refreshes and retries a 401 rather
      // than refreshing twice.
      markSessionReady();

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
    // Releases every route blocked on `awaitSessionReady()`. It must fire
    // whether or not the session came back unlocked — routes check `isUnlocked`
    // themselves; what they cannot do is read the vault before this point.
    markSessionReady();

    // A switch left mid-flight re-arms itself so the wizard can finish it; the
    // token is module state and does not survive the reload.
    if (isSwitchInProgress()) {
      resumeModeSwitch();
    }
  });

  async function handleLock() {
    await lockSession();
    window.location.href = "/unlock";
  }

  function triggerOpenBgproj() {
    isWorkspaceMenuOpen = false;
    fileInput?.click();
  }

  /**
   * Hands the collisions to the modal and waits for a decision.
   *
   * The import genuinely blocks on this promise, so nothing is written until
   * the teacher has chosen — which is the whole point of resolving conflicts
   * before the first write rather than after a 409.
   */
  function askAboutConflicts(
    conflicts: ArchiveConflict[],
    identicalCount: number,
  ): Promise<DecisionMap> {
    pendingConflicts = conflicts;
    pendingIdenticalCount = identicalCount;
    conflictsOpen = true;
    return new Promise<DecisionMap>((resolve, reject) => {
      resolveConflicts = resolve;
      rejectConflicts = reject;
    });
  }

  function handleConflictsConfirmed(decisions: DecisionMap) {
    conflictsOpen = false;
    resolveConflicts?.(decisions);
    resolveConflicts = null;
    rejectConflicts = null;
  }

  function handleConflictsCancelled() {
    conflictsOpen = false;
    rejectConflicts?.(new Error(translate("workspace.archive.importCancelled")));
    resolveConflicts = null;
    rejectConflicts = null;
  }

  async function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    const password = promptArchivePassword(translate("workspace.archive.promptImportPassword"));
    if (!password) {
      input.value = "";
      return;
    }

    try {
      // Merge, not replace: the old flow confirmed a wipe up front and then
      // performed it before the password had even been checked. Existing
      // records are kept unless the teacher says otherwise, one at a time.
      const res = await openBgprojArchive(file, password, {
        mode: "merge",
        resolve: askAboutConflicts,
      });
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

  {#if interruptedSwitch && !resumeBannerDismissed}
    <div
      role="status"
      class="mx-3 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-content sm:mx-5"
    >
      <p class="font-semibold">{$t("storagePolicy.switch.resumeBanner")}</p>
      <p class="mt-1 text-muted">
        {$t("storagePolicy.switch.resumeBody", {
          to: $storagePolicyBadgeStore.text,
        })}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button class="underline underline-offset-2" on:click={() => (switchWizardOpen = true)}>
          {$t("storagePolicy.switch.resumeContinue")}
        </button>
        <button
          class="text-subtle underline underline-offset-2"
          on:click={() => (resumeBannerDismissed = true)}
        >
          {$t("storagePolicy.switch.resumeDismiss")}
        </button>
      </div>
    </div>
  {/if}

  {#if $hasVaultIntegrityFailure}
    <!--
      Not a toast and not the HTTP error modal: the condition is neither
      transient nor an HTTP fault. Until the session is unlocked with the right
      key, every affected record renders blank, so the warning has to stay on
      screen next to those blanks.
    -->
    <div
      role="alert"
      class="mx-3 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-content sm:mx-5"
    >
      <p class="font-semibold">{$t("misc.vaultIntegrity.heading")}</p>
      <p class="mt-1 text-muted">
        {$t("misc.vaultIntegrity.body", {
          count: $vaultIntegrityStore.count,
          kinds: $vaultIntegrityStore.kinds.join(", "),
        })}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button class="underline underline-offset-2" on:click={handleLock}>
          {$t("misc.vaultIntegrity.action")}
        </button>
        <button class="text-subtle underline underline-offset-2" on:click={() => vaultIntegrityStore.reset()}>
          {$t("misc.vaultIntegrity.dismiss")}
        </button>
      </div>
    </div>
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

<StorageModeSwitchWizard
  open={switchWizardOpen}
  target={null}
  onClose={() => (switchWizardOpen = false)}
/>

<ImportConflictModal
  open={conflictsOpen}
  conflicts={pendingConflicts}
  identicalCount={pendingIdenticalCount}
  onConfirm={handleConflictsConfirmed}
  onCancel={handleConflictsCancelled}
/>
