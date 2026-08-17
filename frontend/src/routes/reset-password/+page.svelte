<script lang="ts">
  import { onMount } from "svelte";
  import { api, ApiError } from "$lib/api/client";

  let token = "";
  let newPassword = "";
  let confirmPassword = "";
  let isSubmitting = false;
  let errorMsg = "";
  let successMsg = "";

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    token = urlParams.get("token") || "";
    if (!token) {
      errorMsg = "Password reset token is missing from the link. Please check your reset email.";
    }
  });

  async function handleResetPassword() {
    errorMsg = "";
    successMsg = "";

    if (!token) {
      errorMsg = "Password reset token is missing.";
      return;
    }

    if (!newPassword) {
      errorMsg = "Please enter a new password.";
      return;
    }

    if (newPassword.length < 12) {
      errorMsg = "Password must be at least 12 characters long.";
      return;
    }

    if (newPassword !== confirmPassword) {
      errorMsg = "Passwords do not match.";
      return;
    }

    isSubmitting = true;
    try {
      const res = await api.post<{ message: string }>(
        "/auth/reset-password",
        { token, new_password: newPassword },
        { silentError: true }
      );
      successMsg = res.message || "Password has been successfully set. You can now sign in.";
      newPassword = "";
      confirmPassword = "";
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        errorMsg = err.message;
      } else {
        errorMsg = "Failed to reset password. Please check your connection and try again.";
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="reset-password-container">
  <div class="reset-password-card">
    <div class="card-header">
      <img src="/favicon.png" alt="Examance logo" class="brand-logo" />
      <h1>Set New Password</h1>
      <p class="subtitle">Choose a new password for your Examance account.</p>
    </div>

    {#if successMsg}
      <div class="banner success">{successMsg}</div>
      <div class="action-box">
        <a href="/unlock" class="primary-btn-link">Proceed to Sign In</a>
      </div>
    {:else}
      {#if errorMsg}
        <div class="banner error">{errorMsg}</div>
      {/if}

      <form on:submit|preventDefault={handleResetPassword}>
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input
            id="newPassword"
            type="password"
            bind:value={newPassword}
            placeholder="At least 12 characters"
            autocomplete="new-password"
            minlength="12"
            required
            disabled={isSubmitting || !token}
          />
        </div>

        <div class="form-group">
          <label for="confirmPassword">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            bind:value={confirmPassword}
            placeholder="Repeat new password"
            autocomplete="new-password"
            minlength="12"
            required
            disabled={isSubmitting || !token}
          />
        </div>

        <button type="submit" class="submit-btn" disabled={isSubmitting || !token}>
          {isSubmitting ? "Setting Password..." : "Set New Password"}
        </button>
      </form>
    {/if}

    <div class="card-footer">
      <a href="/unlock" class="back-link">&larr; Back to Unlock / Sign In</a>
    </div>
  </div>
</div>

<style>
  .reset-password-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 28px);
    padding: 2rem 1.5rem;
    box-sizing: border-box;
    background-color: #0f172a;
    color: #f8fafc;
  }

  .reset-password-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 2.5rem;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
  }

  .card-header {
    text-align: center;
    margin-bottom: 1.75rem;
  }

  .brand-logo {
    width: 56px;
    height: 56px;
    object-fit: contain;
    margin-bottom: 0.75rem;
    border-radius: 12px;
  }

  .card-header h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 800;
    color: #38bdf8;
  }

  .subtitle {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #94a3b8;
    line-height: 1.4;
  }

  .banner {
    padding: 0.85rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .banner.success {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid #22c55e;
    color: #86efac;
  }

  .banner.error {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }

  .action-box {
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .primary-btn-link {
    display: inline-block;
    width: 100%;
    padding: 0.75rem;
    background: #0284c7;
    color: white;
    text-align: center;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
    box-sizing: border-box;
  }

  .primary-btn-link:hover {
    background: #0369a1;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .form-group label {
    font-size: 0.8rem;
    font-weight: 500;
    color: #cbd5e1;
  }

  .form-group input {
    padding: 0.65rem 0.75rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f8fafc;
    font-size: 0.875rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .submit-btn {
    width: 100%;
    padding: 0.75rem;
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .submit-btn:hover:not(:disabled) {
    background: #0369a1;
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .card-footer {
    margin-top: 1.5rem;
    text-align: center;
  }

  .back-link {
    font-size: 0.85rem;
    color: #38bdf8;
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }
</style>