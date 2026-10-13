<script lang="ts">
  import { t } from "#lib/i18n";
  import { frontendVersion, isPreviewBuild } from "#lib/stores/versionStore";

  const pr = frontendVersion.match(/PR#(\d+)/)?.[1];
</script>

<!-- Purely visual marker: never blocks clicks, stays below modals (--z-modal). -->
{#if isPreviewBuild}
  <div
    class="pointer-events-none fixed top-0 left-0 h-24 w-24 overflow-hidden"
    style="z-index: var(--z-dropdown)"
    aria-hidden="true"
  >
    <div
      class="bg-warning text-warning-contrast absolute top-4 -left-8 w-32 -rotate-45 py-0.5 text-center text-[0.65rem] font-bold uppercase tracking-wide shadow-md"
    >
      {$t("statusBar.previewBanner")}{pr ? ` #${pr}` : ""}
    </div>
  </div>
{/if}
