<script lang="ts">
  import "./SessionInfo.css";
  export let onLock: () => void;
  export let authenticated: boolean = false;
  export let userRole: string | null = null;
  export let userEmail: string | null = null;
</script>

<div class="session-info">
  {#if authenticated}
    <span class="session-info-mode-badge cloud">☁️ Cloud Mode</span>
    {#if userEmail}
      <span class="session-info-user-email">{userEmail}</span>
    {/if}
    <button on:click={onLock} class="session-info-lock-btn">Lock Session</button>
  {:else}
    <span class="session-info-mode-badge local">💻 Local Mode</span>
    <a href="/unlock" class="session-info-login-btn">Connect to Cloud</a>
    <button on:click={onLock} class="session-info-lock-btn">Lock</button>
  {/if}
</div>
