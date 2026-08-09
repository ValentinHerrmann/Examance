<script lang="ts">
  import "./StatusBar.css";
  export let onStorageClick: () => void;
  export let policyIcon: string = "";
  export let policyLabel: string = "";
  export let backendLabel: string = "";
  export let unlocked: boolean = true;
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
</footer>
