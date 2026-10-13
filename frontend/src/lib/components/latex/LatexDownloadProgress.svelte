<script lang="ts">
  import { t } from "#lib/i18n";
  import { latexDownloadProgress } from "#lib/latex/downloadProgress";
  import { formatBytes } from "#lib/latex/resources";

  const p = $derived($latexDownloadProgress);
</script>

{#if p}
  <div
    class="fixed bottom-4 left-4 right-4 sm:right-auto sm:w-96 rounded-xl border border-line bg-surface-raised p-3 shadow-lg"
    style="z-index: var(--z-toast);"
    role="status"
    aria-live="polite"
  >
    <div class="flex items-baseline justify-between gap-3 text-sm">
      <span class="font-medium text-content">{$t("misc.compiler.downloadTitle")}</span>
      <span class="tabular-nums text-muted">
        {#if p.phase === "download"}
          {$t("misc.compiler.downloadBytes", { loaded: formatBytes(p.loaded), total: formatBytes(p.total) })}
        {:else if p.steps > 0}
          {$t("misc.compiler.prepareStep", { step: Math.min(p.step + 1, p.steps), steps: p.steps })}
        {:else}
          {$t("misc.compiler.prepare")}
        {/if}
      </span>
    </div>
    <!-- No value = indeterminate: unpacking has no byte count. -->
    <progress
      class="mt-2 block h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-surface-inset [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
      max={p.phase === "download" ? p.total || 1 : undefined}
      value={p.phase === "download" ? p.loaded : undefined}
    ></progress>
    <p class="mt-2 text-xs text-subtle">{$t("misc.compiler.downloadHint")}</p>
  </div>
{/if}
