<script lang="ts">
  import "./AppHeader.css";
  import { t } from "$lib/i18n";
  import WorkspaceMenu from "./WorkspaceMenu.svelte";
  import SessionInfo from "./SessionInfo.svelte";

  export let isWorkspaceMenuOpen = false;
  export let onToggleWorkspaceMenu: () => void;
  export let onOpenArchive: () => void;
  export let onExportArchive: () => void;
  export let onClearWorkspace: () => void;
  export let onLock: () => void;
  export let authenticated: boolean = false;
  export let userRole: string | null = null;
  export let userEmail: string | null = null;
</script>

<header class="app-header">
  <div class="app-header-brand">
    <a href="/">
      <img src="/favicon.png" alt={$t("nav.logoAlt")} class="app-header-brand-logo" />
      <span>Examance</span>
    </a>
  </div>
  <nav class="app-header-nav-links">
    <a href="/">{$t("nav.dashboard")}</a>
    <a href="/exercises">{$t("nav.exerciseLibrary")}</a>
    <a href="/analytics">{$t("nav.analytics")}</a>
    {#if userRole === "admin"}
      <a href="/admin/users">{$t("nav.userManagement")}</a>
    {/if}
    <a href="/settings">{$t("nav.settings")}</a>
  </nav>
  <div class="app-header-right">
    <div class="workspace-menu-container">
      <button class="app-header-action-btn" on:click={onToggleWorkspaceMenu}>
        ⚙️ {$t("nav.workspace")} ▾
      </button>
      <WorkspaceMenu
        isOpen={isWorkspaceMenuOpen}
        onToggleMenu={onToggleWorkspaceMenu}
        onOpenArchive={onOpenArchive}
        onExportArchive={onExportArchive}
        onClearWorkspace={onClearWorkspace}
      />
    </div>

    <SessionInfo
      {authenticated}
      {userRole}
      {userEmail}
      onLock={onLock}
    />
  </div>
</header>
