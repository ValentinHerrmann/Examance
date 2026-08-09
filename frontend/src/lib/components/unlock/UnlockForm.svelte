<script lang="ts">
  import "./UnlockForm.css";
  export let backendUrl: string;
  export let email: string;
  export let password: string;
  export let errorMsg: string;
  export let isLoading: boolean;
  export let onUnlock: () => void;
  export let onUnlockLocal: () => void;
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
      <li>✨ Zero setup or registration needed</li>
      <li>🔒 Full offline GDPR encryption</li>
      <li>💾 Export/Import workspace as .bgproj file</li>
    </ul>
    <button
      type="button"
      class="local-unlock-btn"
      on:click={onUnlockLocal}
      disabled={isLoading}
    >
      Start Local Mode
    </button>
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
        <input
          id="backendUrl"
          type="text"
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
      </div>

      <button type="submit" class="submit-btn" class:is-loading={isLoading} disabled={isLoading}>
        {isLoading ? "Authenticating..." : "Connect & Sign In"}
      </button>
    </form>
  </div>
</div>
