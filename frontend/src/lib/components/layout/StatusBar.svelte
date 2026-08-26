<script lang="ts">
  import type { VersionStatus } from "$lib/stores/versionStore";
  import { locale, t, toggleLocale, LOCALE_LABELS } from "$lib/i18n";
  export let onStorageClick: () => void;
  export let onHelpClick: () => void = () => {};
  /** Quiet highlight until the help panel has been opened once. */
  export let helpUnseen: boolean = false;
  export let policyIcon: string = "";
  export let policyLabel: string = "";
  export let backendLabel: string = "";
  export let unlocked: boolean = true;
  export let frontendVersion: string = "";
  export let backendVersion: string | null = null;
  export let versionStatus: VersionStatus = "no-server";
  export let versionUrl: string | null = null;

  const VERSION_CLASS: Record<VersionStatus, string> = {
    match: "",
    mismatch: "version-mismatch",
    incompatible: "version-incompatible",
    unknown: "version-unknown",
    "no-server": "version-unknown",
  };

  // Prefer backend version for display when available — it's authoritative
  // (server is the source of truth for compatibility). Fall back to frontend
  // version for local-only mode or when backend is unreachable.
  $: versionLabel = backendVersion ? `v${backendVersion}` : `v${frontendVersion}`;

  const displayVersion = backendVersion || frontendVersion;
  $: versionTitle = {
    match: $t("statusBar.versionMatch", { version: displayVersion }),
    mismatch: $t("statusBar.versionMismatch", { version: displayVersion }),
    incompatible: $t("statusBar.versionIncompatible", { version: displayVersion }),
    unknown: $t("statusBar.versionUnknown", { version: displayVersion }),
    "no-server": $t("statusBar.versionNoServer", { version: displayVersion }),
  }[versionStatus];

  // Bare semver ("1.4.0") is a tagged release; PR builds link to the PR,
  // others to the commit. Reflected in the tooltip so the link target is
  // obvious before it's clicked.
  $: versionLinkTitle = versionUrl
    ? `${versionTitle} — ${displayVersion.includes("PR#") ? $t("statusBar.linkPullRequest") : displayVersion.includes("-") ? $t("statusBar.linkCommit") : $t("statusBar.linkRelease")}`
    : versionTitle;

  // The next language in the cycle — what a click switches to.
  $: nextLocaleLabel = LOCALE_LABELS[$locale === "de" ? "en" : "de"];

  const LOCALE_FLAG: Record<string, string> = {
    de: "🇩🇪",
    en: "🇬🇧",
  };
</script>

<footer
  class="scroll-pane flex shrink-0 items-center gap-1 overflow-x-auto bg-[#007acc] px-2 py-1 font-mono text-xs font-medium whitespace-nowrap text-white sm:px-4"
>
  <button
    type="button"
    on:click={toggleLocale}
    class="statusbar-item statusbar-locale"
    title={$t("statusBar.languageHint", { language: nextLocaleLabel })}
  >
    <span class="statusbar-icon">{LOCALE_FLAG[$locale]}</span>
    <span class="statusbar-label">{$locale.toUpperCase()}</span>
  </button>

  <button
    type="button"
    on:click={onStorageClick}
    class="statusbar-item"
    title={unlocked
      ? $t("statusBar.storageSettingsHint")
      : $t("statusBar.lockedHint")}
  >
    <span class="statusbar-icon">{policyIcon}</span>
    <span class="statusbar-label hidden max-w-[20ch] truncate sm:inline">{policyLabel}</span>
  </button>

  <!-- § 5 DDG requires the Impressum to be reachable from every page; folded
       in here rather than a dedicated footer bar so it doesn't cost every
       page a second reserved strip of height. -->
  <button
    type="button"
    on:click={onHelpClick}
    class="statusbar-item {helpUnseen ? 'statusbar-help-unseen' : ''}"
    title={$t("help.ui.statusBarHint")}
  >
    <span class="statusbar-icon">❓</span>
    <span class="statusbar-label hidden sm:inline">{$t("help.ui.title")}</span>
  </button>

  <a href="/legal/impressum" class="statusbar-item" title={$t("nav.imprint")}>
    <span class="statusbar-icon">📄</span>
    <span class="statusbar-label hidden sm:inline">{$t("nav.imprint")}</span>
  </a>

  <a href="/legal/datenschutz" class="statusbar-item" title={$t("nav.privacy")}>
    <span class="statusbar-icon">🔒</span>
    <span class="statusbar-label hidden sm:inline">{$t("nav.privacy")}</span>
  </a>

  <button
    type="button"
    on:click={onStorageClick}
    class="statusbar-item statusbar-right"
    title={unlocked ? $t("statusBar.backendConfigureHint") : $t("statusBar.backendCurrent")}
  >
    <span class="statusbar-icon">🖥️</span>
    <span class="statusbar-label hidden max-w-[16ch] truncate sm:inline md:max-w-[32ch]">
      {backendLabel || $t("statusBar.noServer")}
    </span>
  </button>

  {#if versionUrl}
    <a
      href={versionUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="statusbar-item statusbar-version statusbar-version-link {VERSION_CLASS[versionStatus]}"
      title={versionLinkTitle}
    >
      <span class="statusbar-icon">🏷️</span>
      <span class="statusbar-label">{versionLabel}</span>
    </a>
  {:else}
    <span class="statusbar-item statusbar-version {VERSION_CLASS[versionStatus]}" title={versionLinkTitle}>
      <span class="statusbar-icon">🏷️</span>
      <span class="statusbar-label">{versionLabel}</span>
    </span>
  {/if}
</footer>

<style>
  /* Shared shape for every status-bar entry. Kept here rather than repeated as
     a utility string on each of the four items. */
  .statusbar-item {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    flex-shrink: 0;
    color: #ffffff;
    text-decoration: none;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    transition: background 0.15s ease;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }

  .statusbar-item:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Never opened the help panel: a light outline, no badge and no animation —
     the status bar is not the place for an attention grab. */
  .statusbar-help-unseen {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
  }

  /* Pushes the backend + version cluster to the trailing edge. */
  .statusbar-right {
    margin-left: auto;
  }

  /* Uppercase two-letter code keeps the item narrow in both languages. */
  .statusbar-locale .statusbar-label {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.05em;
  }

  /* Default: no link target (e.g. local dev build), so it must not look
     clickable. */
  .statusbar-version {
    cursor: default;
    color: inherit;
    text-decoration: none;
  }

  .statusbar-version:hover {
    background: none;
  }

  /* Only the linked variant (a release or a build commit) invites a click. */
  .statusbar-version-link {
    cursor: pointer;
  }

  .statusbar-version-link:hover,
  .statusbar-version-link:focus-visible {
    text-decoration: underline;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Amber and red rather than plain yellow: the status bar sits on #007acc,
     where pure yellow loses contrast against the blue. */
  .statusbar-version.version-mismatch {
    color: #ffd166;
  }

  .statusbar-version.version-incompatible {
    color: #ff8a80;
    font-weight: 700;
  }

  .statusbar-version.version-unknown {
    color: rgba(255, 255, 255, 0.6);
  }
</style>
