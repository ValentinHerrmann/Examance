<script lang="ts">
  import { t } from "$lib/i18n";

  export let isOpen = false;
  export let onToggleMenu: () => void;
  export let onOpenArchive: () => void;
  export let onExportArchive: () => void;
  export let onClearWorkspace: () => void;

  const itemBase =
    "flex cursor-pointer items-center gap-2 rounded border-none bg-transparent px-3 py-2 text-left text-sm font-medium transition-colors";

  function run(action: () => void) {
    return () => {
      onToggleMenu();
      action();
    };
  }
</script>

{#if isOpen}
  <div
    class="absolute top-[calc(100%+6px)] right-0 flex min-w-44 flex-col gap-0.5 rounded-lg border border-line bg-surface-raised p-1.5 shadow-lg shadow-black/40"
    style="z-index: var(--z-dropdown)"
  >
    <button class="{itemBase} text-slate-300 hover:bg-surface-inset hover:text-white" on:click={run(onOpenArchive)}>
      {$t("workspace.menu.open")}
    </button>
    <button class="{itemBase} text-slate-300 hover:bg-surface-inset hover:text-white" on:click={run(onExportArchive)}>
      {$t("workspace.menu.export")}
    </button>
    <button class="{itemBase} text-red-300 hover:bg-red-900 hover:text-white" on:click={run(onClearWorkspace)}>
      {$t("workspace.menu.clear")}
    </button>
  </div>
{/if}
