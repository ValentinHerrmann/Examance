<script lang="ts">
  import "./StatusBar.css";
  import type { VersionStatus } from "$lib/stores/versionStore";
  export let onStorageClick: () => void;
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

  $: versionLabel =
    backendVersion && backendVersion !== frontendVersion
      ? `v${frontendVersion} / ${backendVersion}`
      : `v${frontendVersion}`;

  $: versionTitle = {
    match: `App and server both run v${frontendVersion}`,
    mismatch: `App v${frontendVersion}, server v${backendVersion} — versions differ but stay compatible`,
    incompatible: `App v${frontendVersion}, server v${backendVersion} — different major version, these are incompatible`,
    unknown: `App v${frontendVersion} — server version unavailable`,
    "no-server": `App v${frontendVersion} — no server configured`,
  }[versionStatus];

  // Bare semver ("1.4.0") is a tagged release; anything else was built from a
  // specific commit. Reflected in the tooltip so the link target is obvious
  // before it's clicked.
  $: versionLinkTitle = versionUrl
    ? `${versionTitle} — ${frontendVersion.includes("-") ? "open build commit on GitHub" : "open release on GitHub"}`
    : versionTitle;
</script>

<footer class="vscode-statusbar">
  <button
    type="button"
    on:click={onStorageClick}
    class="statusbar-item"
    title={unlocked
      ? "Click to change storage & privacy settings"
      : "Session locked — Click to unlock"}
  >
    <span class="statusbar-icon">{policyIcon}</span>
    <span class="statusbar-label">{policyLabel}</span>
  </button>

  <button
    type="button"
    on:click={onStorageClick}
    class="statusbar-item statusbar-right"
    title={unlocked ? "Click to configure backend server address" : "Current Backend Server"}
  >
    <span class="statusbar-icon">🖥️</span>
    <span class="statusbar-label">{backendLabel || "No Server Configured"}</span>
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
