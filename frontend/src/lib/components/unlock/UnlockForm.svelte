<script lang="ts">
  import "./UnlockForm.css";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  export let backendUrl: string;
  export let email: string;
  export let password: string;
  export let errorMsg: string;
  export let isLoading: boolean;
  export let onUnlock: () => void;
  export let onUnlockLocal: () => void;
  export let localPassphrase: string;
  export let localPassphraseConfirm: string;
  /** First use on this device, or a legacy vault being migrated — confirm the passphrase. */
  export let isNewLocalVault: boolean;
  /** A vault created before the passphrase change; unlocking re-encrypts it. */
  export let needsLegacyMigration: boolean;
</script>

<div class="unlock-header">
  <img src="/favicon.png" alt="Examance logo" class="unlock-banner-logo" />
  <h1>Welcome to Examance</h1>
  <p class="unlock-subtitle">Privacy-First Anonymous Exam Management & Grading</p>
</div>

{#if errorMsg}
  <div class="unlock-error-banner">{errorMsg}</div>
{/if}

<div class="unlock-options-grid">
  <!-- Option A: Local Mode -->
  <div class="option-card local-card">
    <div class="card-badge">No Account Required</div>
    <div class="card-icon">🛡️</div>
    <h2>Start Local Workspace</h2>
    <p class="description">
      Ideal for solo offline grading. All data is encrypted with local keys and stored directly in your browser.
    </p>
    <ul class="features-list">
      <li>✨ No registration needed</li>
      <li>🔒 Encrypted at rest with your passphrase</li>
      <li>💾 Export/Import workspace as .bgproj file</li>
    </ul>

    {#if needsLegacyMigration}
      <p class="local-notice">
        This workspace was created with an older version that kept its key in
        browser storage. Choose a passphrase now — your existing data will be
        re-encrypted with it.
      </p>
    {/if}

    <form on:submit|preventDefault={onUnlockLocal} class="local-form">
      <div class="form-group">
        <label for="localPassphrase">
          {isNewLocalVault ? "Choose a passphrase" : "Workspace passphrase"}
        </label>
        <input
          id="localPassphrase"
          type="password"
          autocomplete={isNewLocalVault ? "new-password" : "current-password"}
          bind:value={localPassphrase}
          placeholder="At least 12 characters"
          disabled={isLoading}
        />
      </div>

      {#if isNewLocalVault}
        <div class="form-group">
          <label for="localPassphraseConfirm">Repeat passphrase</label>
          <input
            id="localPassphraseConfirm"
            type="password"
            autocomplete="new-password"
            bind:value={localPassphraseConfirm}
            disabled={isLoading}
          />
        </div>
        <p class="local-warning">
          There is no recovery. The passphrase never leaves this device and is
          never stored, so if you forget it the workspace cannot be opened.
          Keep a .bgproj export as a backup.
        </p>
      {/if}

      <button type="submit" class="local-unlock-btn" disabled={isLoading}>
        {#if needsLegacyMigration}
          Set passphrase & migrate
        {:else if isNewLocalVault}
          Create Local Workspace
        {:else}
          Unlock Local Workspace
        {/if}
      </button>
    </form>
  </div>

  <!-- Option B: Cloud Account -->
  <div class="option-card cloud-card">
    <div class="card-badge cloud">School Account</div>
    <div class="card-icon">☁️</div>
    <h2>Connect to Cloud Server</h2>
    <p class="description">
      Sync exams across devices and connect with your institution's backend server.
    </p>

    <form on:submit|preventDefault={onUnlock} class="cloud-form">
      <div class="form-group">
        <label for="backendUrl">Backend Server URL</label>
        <SuggestInput
          id="backendUrl"
          storageKey="backend.url"
          bind:value={backendUrl}
          placeholder="e.g. http://localhost:8000"
          required
        />
      </div>

      <div class="form-group">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="teacher@school.example"
          required
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Enter password"
          required
        />
        <div class="forgot-password-link">
          <a href="/forgot-password">Forgot password?</a>
        </div>
      </div>

      <button type="submit" class="submit-btn" class:is-loading={isLoading} disabled={isLoading}>
        {isLoading ? "Authenticating..." : "Connect & Sign In"}
      </button>
    </form>
  </div>
</div>

<style>
  /* New styles live in the component, not the sibling .css file. */
  .local-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    margin-top: auto;
  }

  .local-notice,
  .local-warning {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    line-height: 1.4;
    text-align: left;
  }

  .local-notice {
    color: #fcd34d;
  }

  .local-warning {
    color: #94a3b8;
  }
</style>
