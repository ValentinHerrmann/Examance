<script lang="ts">
  import { api, ApiError } from "$lib/api/client";
  import { t, translate } from "$lib/i18n";

  let email = "";
  let isSubmitting = false;
  let errorMsg = "";
  let successMsg = "";

  async function handleForgotPassword() {
    errorMsg = "";
    successMsg = "";

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      errorMsg = translate("auth.forgotPassword.errors.enterEmail");
      return;
    }

    isSubmitting = true;
    try {
      const res = await api.post<{ message: string }>(
        "/auth/forgot-password",
        { email: normalizedEmail },
        { silentError: true }
      );
      successMsg = res.message || translate("auth.forgotPassword.defaultSuccess");
      email = "";
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        errorMsg = err.message;
      } else {
        errorMsg = translate("auth.forgotPassword.errors.failed");
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="forgot-password-container flex min-h-full items-center justify-center box-border px-4 py-8 sm:px-6 sm:py-12">
  <div class="forgot-password-card w-full max-w-form">
    <div class="card-header">
      <img src="/favicon.png" alt="Examance logo" class="brand-logo" />
      <h1>{$t("auth.forgotPassword.title")}</h1>
      <p class="subtitle">{$t("auth.forgotPassword.subtitle")}</p>
    </div>

    {#if successMsg}
      <div class="banner success">{successMsg}</div>
    {/if}
    {#if errorMsg}
      <div class="banner error">{errorMsg}</div>
    {/if}

    <form on:submit|preventDefault={handleForgotPassword}>
      <div class="form-group">
        <label for="email">{$t("auth.forgotPassword.emailLabel")}</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder={$t("auth.forgotPassword.emailPlaceholder")}
          required
          disabled={isSubmitting}
        />
      </div>

      <button type="submit" class="submit-btn" disabled={isSubmitting}>
        {isSubmitting ? $t("auth.forgotPassword.sending") : $t("auth.forgotPassword.sendLink")}
      </button>
    </form>

    <div class="card-footer">
      <a href="/unlock" class="back-link">{$t("auth.forgotPassword.backToUnlock")}</a>
    </div>
  </div>
</div>

<style>
  .forgot-password-container {
    background-color: #0f172a;
    color: #f8fafc;
  }

  .forgot-password-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 2.5rem;
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