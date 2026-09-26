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
    storagePolicyLabelStore,
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

  // A mode switch interrupted after its wipe: say why the workspace is empty.
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
    isWorkspaceMenuOpen = false;
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
  {#if $isUnlocked && $page.url.pathname !== "/unlock"}
    {#if !isGradeActive || showFocusNav}
      <AppHeader
        bind:isWorkspaceMenuOpen
        onToggleWorkspaceMenu={() => (isWorkspaceMenuOpen = !isWorkspaceMenuOpen)}
        onOpenArchive={triggerOpenBgproj}
        onExportArchive={() => exportArchiveInteractively()}
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

  {#if $vaultIntegrityStore.count > 0}
    <!--
      Not a toast or the HTTP error modal: until unlocked with the right key,
      affected records render blank, so this stays on screen next to them.
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

<ImportConflictModal />
