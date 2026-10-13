<script lang="ts">
  import { t } from "#lib/i18n";
  import { isPreviewBuild } from "#lib/stores/versionStore";
</script>

<!-- Purely visual marker: never blocks clicks, stays below modals (--z-modal). The band is centred on
     the corner diagonal (centre 3.25rem from both edges) so its label always lies fully inside the 8rem box. -->
{#if isPreviewBuild}
  <div
    class="pointer-events-none fixed top-0 left-0 h-32 w-32 overflow-hidden"
    style="z-index: var(--z-dropdown)"
    aria-hidden="true"
  >
    <div
      class="bg-warning text-warning-contrast absolute top-[3.25rem] left-[3.25rem] w-48 -translate-x-1/2 -translate-y-1/2 -rotate-45 py-0.5 text-center text-[0.65rem] font-bold uppercase tracking-wide shadow-md"
    >
      {$t("statusBar.previewBanner")}
    </div>
  </div>
{/if}
