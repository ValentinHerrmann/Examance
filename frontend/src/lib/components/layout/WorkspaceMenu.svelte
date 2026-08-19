<script lang="ts">
  import "./WorkspaceMenu.css";
  import { t } from "$lib/i18n";
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
    <button on:click={handleOpen}>{$t("workspace.menu.open")}</button>
    <button on:click={handleExport}>{$t("workspace.menu.export")}</button>
    <button class="danger" on:click={handleClear}>{$t("workspace.menu.clear")}</button>
  </div>
{/if}
