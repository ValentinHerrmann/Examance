<script lang="ts">
  import "./SessionInfo.css";
  import { t } from "$lib/i18n";
  export let onLock: () => void;
  export let authenticated: boolean = false;
  export let userRole: string | null = null;
  export let userEmail: string | null = null;
</script>

<div class="session-info">
  {#if authenticated}
    <span class="session-info-mode-badge cloud">{$t("workspace.session.cloudMode")}</span>
    {#if userEmail}
      <span class="session-info-user-email">{userEmail}</span>
    {/if}
    <button on:click={onLock} class="session-info-lock-btn">{$t("workspace.session.lockSession")}</button>
  {:else}
    <span class="session-info-mode-badge local">{$t("workspace.session.localMode")}</span>
    <a href="/unlock" class="session-info-login-btn">{$t("workspace.session.connectToCloud")}</a>
    <button on:click={onLock} class="session-info-lock-btn">{$t("workspace.session.lock")}</button>
  {/if}
</div>
