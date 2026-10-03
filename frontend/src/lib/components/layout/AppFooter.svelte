<script lang="ts">
  import type { VersionStatus } from "$lib/stores/versionStore";
  import { t } from "$lib/i18n";

  /**
   * Slim page footer (Artemis): legal links, server address and version. Sits
   * at the end of `.app-main`'s scroll, pinned to the bottom on short pages by
   * `mt-auto`. § 5 DDG wants the Impressum reachable from every page — that is
   * why it also renders on the grade page.
   *
   * The version shown is the backend's when known: the server is the source of
   * truth for compatibility. Mismatches are also flagged in the navbar.
   */
  export let onBackendClick: () => void;
  export let backendLabel = "";
  export let unlocked = true;
  export let frontendVersion = "";
  export let backendVersion: string | null = null;
  export let versionStatus: VersionStatus = "no-server";
  export let versionUrl: string | null = null;

  $: displayVersion = backendVersion || frontendVersion;
  $: versionTitle = {
    match: $t("statusBar.versionMatch", { version: displayVersion }),
    mismatch: $t("statusBar.versionMismatch", { version: displayVersion }),
    incompatible: $t("statusBar.versionIncompatible", { version: displayVersion }),
    unknown: $t("statusBar.versionUnknown", { version: displayVersion }),
    "no-server": $t("statusBar.versionNoServer", { version: displayVersion }),
  }[versionStatus];

  // Bare semver is a tagged release; PR builds link to the PR, others to the
  // commit. Said in the tooltip so the target is clear before the click.
  $: versionLinkTitle = versionUrl
    ? `${versionTitle} — ${
        displayVersion.includes("PR#")
          ? $t("statusBar.linkPullRequest")
          : displayVersion.includes("-")
            ? $t("statusBar.linkCommit")
            : $t("statusBar.linkRelease")
      }`
    : versionTitle;

  const versionTone: Record<VersionStatus, string> = {
    match: "text-muted",
    mismatch: "text-warning-fg font-semibold",
    incompatible: "text-danger-fg font-semibold",
    unknown: "text-muted",
    "no-server": "text-muted",
  };

  const item = "inline-flex min-h-6 items-center whitespace-nowrap text-muted no-underline hover:text-content hover:underline";
</script>

<footer
  role="contentinfo"
  class="mt-auto flex min-h-8 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-raised px-4 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-xs"
>
  <nav class="flex items-center gap-x-4" aria-label={$t("nav.legal")}>
    <a href="/legal/impressum" class={item}>{$t("nav.imprint")}</a>
    <a href="/legal/datenschutz" class={item}>{$t("nav.privacy")}</a>
    <a href="/third-party-notices.txt" class={item} target="_blank" rel="noopener">{$t("nav.licenses")}</a>
  </nav>

  <div class="ml-auto flex min-w-0 items-center gap-x-4">
    <button
      type="button"
      class="{item} min-w-0 cursor-pointer border-0 bg-transparent p-0"
      title={unlocked ? $t("statusBar.backendConfigureHint") : $t("statusBar.backendCurrent")}
      on:click={onBackendClick}
    >
      <span class="max-w-[24ch] truncate sm:max-w-[40ch]">{backendLabel || $t("statusBar.noServer")}</span>
    </button>
    {#if versionUrl}
      <a
        href={versionUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="{item} {versionTone[versionStatus]}"
        title={versionLinkTitle}
      >
        v{displayVersion}
      </a>
    {:else}
      <span class="inline-flex items-center whitespace-nowrap {versionTone[versionStatus]}" title={versionLinkTitle}>
        v{displayVersion}
      </span>
    {/if}
  </div>
</footer>
