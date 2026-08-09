<script lang="ts">
  import "./AppHeader.css";
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
      <img src="/favicon.png" alt="Examance logo" class="app-header-brand-logo" />
      <span>Examance</span>
    </a>
  </div>
  <nav class="app-header-nav-links">
    <a href="/">Dashboard</a>
    <a href="/exercises">Exercise Library</a>
    <a href="/analytics">Analytics</a>
    {#if userRole === "admin"}
      <a href="/admin/users">User Management</a>
    {/if}
    <a href="/settings">Settings</a>
  </nav>
  <div class="app-header-right">
    <div class="workspace-menu-container">
      <button class="app-header-action-btn" on:click={onToggleWorkspaceMenu}>
        ⚙️ Workspace ▾
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
