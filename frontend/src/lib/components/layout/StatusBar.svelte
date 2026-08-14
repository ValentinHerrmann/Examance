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

  <span class="statusbar-item statusbar-version {VERSION_CLASS[versionStatus]}" title={versionTitle}>
    <span class="statusbar-icon">🏷️</span>
    <span class="statusbar-label">{versionLabel}</span>
  </span>
</footer>

<style>
  /* Not a button — purely informational, so it must not look clickable. */
  .statusbar-version {
    cursor: default;
  }

  .statusbar-version:hover {
    background: none;
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
