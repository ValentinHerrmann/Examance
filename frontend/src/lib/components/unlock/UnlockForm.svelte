<script lang="ts">
  import "./UnlockForm.css";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { t } from "$lib/i18n";
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
  <h1>{$t("auth.unlock.title")}</h1>
  <p class="unlock-subtitle">{$t("auth.unlock.subtitle")}</p>
  <!-- The very first screen someone sees, and the one place where no workspace
       exists yet to explain itself. /help is a public path, so this works while
       locked. A filled pill rather than plain text — this is the one moment a
       first-time visitor has nothing else on screen to orient by. -->
  <a class="unlock-help-badge" href="/help">
    <span aria-hidden="true">❓</span>
    {$t("help.ui.unlockLink")}
    <span aria-hidden="true">→</span>
  </a>
</div>

{#if errorMsg}
  <div class="unlock-error-banner">{errorMsg}</div>
{/if}

<div class="unlock-options-grid">
  <!-- Option A: Local Mode -->
  <div class="option-card local-card">
    <div class="card-badge">{$t("auth.unlock.local.noAccountRequired")}</div>
    <div class="card-icon">🛡️</div>
    <h2>{$t("auth.unlock.local.startWorkspace")}</h2>
    <p class="description">
      {$t("auth.unlock.local.description")}
    </p>
    <ul class="features-list">
      <li>{$t("auth.unlock.local.featureNoRegistration")}</li>
      <li>{$t("auth.unlock.local.featureEncrypted")}</li>
      <li>{$t("auth.unlock.local.featureExportImport")}</li>
    </ul>

    {#if needsLegacyMigration}
      <p class="local-notice">
        {$t("auth.unlock.local.legacyMigrationNotice")}
      </p>
    {/if}

    <form on:submit|preventDefault={onUnlockLocal} class="local-form">
      <div class="form-group">
        <label for="localPassphrase">
          {isNewLocalVault ? $t("auth.unlock.local.choosePassphrase") : $t("auth.unlock.local.workspacePassphrase")}
        </label>
        <input
          id="localPassphrase"
          type="password"
          autocomplete={isNewLocalVault ? "new-password" : "current-password"}
          bind:value={localPassphrase}
          placeholder={$t("auth.unlock.local.passphrasePlaceholder")}
          disabled={isLoading}
        />
      </div>

      {#if isNewLocalVault}
        <div class="form-group">
          <label for="localPassphraseConfirm">{$t("auth.unlock.local.repeatPassphrase")}</label>
          <input
            id="localPassphraseConfirm"
            type="password"
            autocomplete="new-password"
            bind:value={localPassphraseConfirm}
            disabled={isLoading}
          />
        </div>
        <p class="local-warning">
          {$t("auth.unlock.local.noRecoveryWarning")}
        </p>
      {/if}

      <button type="submit" class="local-unlock-btn" disabled={isLoading}>
        {#if needsLegacyMigration}
          {$t("auth.unlock.local.setPassphraseAndMigrate")}
        {:else if isNewLocalVault}
          {$t("auth.unlock.local.createWorkspace")}
        {:else}
          {$t("auth.unlock.local.unlockWorkspace")}
        {/if}
      </button>
    </form>
  </div>

  <!-- Option B: Cloud Account -->
  <div class="option-card cloud-card">
    <div class="card-badge cloud">{$t("auth.unlock.cloud.schoolAccount")}</div>
    <div class="card-icon">☁️</div>
    <h2>{$t("auth.unlock.cloud.connectToServer")}</h2>
    <p class="description">
      {$t("auth.unlock.cloud.description")}
    </p>

    <form on:submit|preventDefault={onUnlock} class="cloud-form">
      <div class="form-group">
        <label for="backendUrl">{$t("auth.unlock.cloud.backendUrl")}</label>
        <SuggestInput
          id="backendUrl"
          storageKey="backend.url"
          bind:value={backendUrl}
          placeholder={$t("auth.unlock.cloud.backendUrlPlaceholder")}
          required
        />
      </div>

      <div class="form-group">
        <label for="email">{$t("auth.unlock.cloud.email")}</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder={$t("auth.unlock.cloud.emailPlaceholder")}
          required
        />
      </div>

      <div class="form-group">
        <label for="password">{$t("auth.unlock.cloud.password")}</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder={$t("auth.unlock.cloud.passwordPlaceholder")}
          required
        />
        <div class="forgot-password-link">
          <a href="/forgot-password">{$t("auth.unlock.cloud.forgotPassword")}</a>
        </div>
      </div>

      <button type="submit" class="submit-btn" class:is-loading={isLoading} disabled={isLoading}>
        {isLoading ? $t("auth.unlock.cloud.authenticating") : $t("auth.unlock.cloud.connectAndSignIn")}
      </button>
    </form>
  </div>
</div>

<style>
  /* New styles live in the component, not the sibling .css file. */
  .unlock-help-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.85rem;
    padding: 0.5rem 1.1rem;
    border: 1px solid rgba(56, 189, 248, 0.4);
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.12);
    color: #7dd3fc;
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .unlock-help-badge:hover,
  .unlock-help-badge:focus-visible {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.2);
  }

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
