<script lang="ts">
  import "./WorkspaceMenu.css";
  export let isOpen = false;
  export let onToggleMenu: () => void;
  export let onOpenArchive: () => void;
  export let onExportArchive: () => void;
  export let onClearWorkspace: () => void;

  function handleOpen() {
    onToggleMenu();
    onOpenArchive();
  }

  function handleExport() {
    onToggleMenu();
    onExportArchive();
  }

  function handleClear() {
    onToggleMenu();
    onClearWorkspace();
  }
</script>

{#if isOpen}
  <div class="workspace-dropdown">
    <button on:click={handleOpen}>📂 Open .bgproj</button>
    <button on:click={handleExport}>💾 Export .bgproj</button>
    <button class="danger" on:click={handleClear}>❌ Clear Workspace</button>
  </div>
{/if}
