<script lang="ts">
  import type { VersionStatus } from "#lib/stores/versionStore";
  import { locale, t } from "#lib/i18n";
  import { docsHref } from "#lib/help/docsLink";

  /** Slim page footer (Artemis): legal links, docs link, version, pinned to the bottom by `mt-auto`. Renders on the grade page too (section 5 DDG: Impressum reachable from every page). The backend's version wins when known (the server is the source of truth for compatibility); mismatches are also flagged in the navbar. */
  interface Props {
    frontendVersion?: string;
    backendVersion?: string | null;
    versionStatus?: VersionStatus;
    versionUrl?: string | null;
  }

  let {
    frontendVersion = "",
    backendVersion = null,
    versionStatus = "unknown",
    versionUrl = null,
  }: Props = $props();

  let displayVersion = $derived(backendVersion || frontendVersion);
  let versionTitle = $derived({
    match: $t("statusBar.versionMatch", { version: displayVersion }),
    mismatch: $t("statusBar.versionMismatch", { version: displayVersion }),
    incompatible: $t("statusBar.versionIncompatible", { version: displayVersion }),
    unknown: $t("statusBar.versionUnknown", { version: displayVersion }),
  }[versionStatus]);

  // Bare semver is a tagged release; PR builds link to the PR, others to the commit. Said in the tooltip.
  let versionLinkTitle = $derived(versionUrl
    ? `${versionTitle} — ${
        displayVersion.includes("PR#")
          ? $t("statusBar.linkPullRequest")
          : displayVersion.includes("-")
            ? $t("statusBar.linkCommit")
            : $t("statusBar.linkRelease")
      }`
    : versionTitle);

  const versionTone: Record<VersionStatus, string> = {
    match: "text-muted",
    mismatch: "text-warning-fg font-semibold",
    incompatible: "text-danger-fg font-semibold",
    unknown: "text-muted",
  };

  const item = "inline-flex min-h-6 items-center whitespace-nowrap text-muted no-underline hover:text-content hover:underline";
</script>

<!-- svelte-ignore a11y_no_redundant_roles -->
<footer
  role="contentinfo"
  class="mt-auto flex min-h-8 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-raised px-4 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-xs"
>
  <nav class="flex items-center gap-x-4" aria-label={$t("nav.legal")}>
    <a href="/legal/impressum" class={item}>{$t("nav.imprint")}</a>
    <a href="/legal/datenschutz" class={item}>{$t("nav.privacy")}</a>
    <a href="/third-party-notices.txt" class={item} target="_blank" rel="noopener">{$t("nav.licenses")}</a>
  </nav>
  <a href={docsHref("", $locale)} class={item} target="_blank" rel="noopener noreferrer">{$t("nav.docs")}</a>

  <div class="ml-auto flex min-w-0 items-center gap-x-4">
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
