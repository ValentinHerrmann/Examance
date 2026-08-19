<script lang="ts">
  import "./UserManagement.css";
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client';
  import { isUnlocked, sessionStore } from '$lib/stores/session';
  import { t, translate } from '$lib/i18n';

  type UserRole = 'teacher' | 'admin';

  let email = '';
  let role: UserRole = 'teacher';

  let isSubmitting = false;
  let errorMsg = '';
  let warningMsg = '';
  let successMsg = '';

  $: canAccess = $isUnlocked && $sessionStore.role === 'admin';

  $: {
    if (email.trim()) {
      sessionStore.setDirty(true);
    }
  }

  onMount(() => {
    if (!$isUnlocked) {
      window.location.href = '/unlock';
    }
  });

  function validate(): string | null {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return translate('admin.users.emailRequired');
    return null;
  }

  async function handleCreateUser() {
    errorMsg = '';
    warningMsg = '';
    successMsg = '';

    if (!canAccess) {
      errorMsg = translate('admin.users.accessRequired');
      return;
    }

    const validationError = validate();
    if (validationError) {
      errorMsg = validationError;
      return;
    }

    isSubmitting = true;
    try {
      const payload = { email: email.trim(), role };
      const created = await api.post<{ id: string; email: string; role: UserRole; password_reset_sent: boolean }>(
        '/admin/users',
        payload
      );

      if (created.password_reset_sent) {
        successMsg = translate('admin.users.createdSuccess', { role: created.role, email: created.email });
      } else {
        warningMsg = translate('admin.users.createdWarning', { role: created.role, email: created.email });
      }
      email = '';
      sessionStore.setDirty(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          errorMsg = translate('admin.users.onlyAdminsCanCreate');
        } else if (err.status === 409) {
          errorMsg = translate('admin.users.emailExists');
        } else {
          errorMsg = err.message;
        }
      } else {
        errorMsg = translate('admin.users.createFailed');
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="admin-users-page">
  <div class="user-mgmt-header">
    <h2>{$t("admin.users.pageTitle")}</h2>
    <p>{$t("admin.users.pageSubtitle")}</p>
  </div>

  {#if !$isUnlocked}
    <div class="user-mgmt-state-card">
      <p>{$t("admin.users.locked")}</p>
      <a href="/unlock" class="user-mgmt-primary-link">{$t("admin.users.goToUnlock")}</a>
    </div>
  {:else if $sessionStore.role !== 'admin'}
    <div class="user-mgmt-state-card danger">
      <p>{$t("admin.users.roleRequired")}</p>
      <p class="user-mgmt-sub">{$t("admin.users.roleRequiredSub")}</p>
    </div>
  {:else}
    <div class="user-mgmt-form-card">
      {#if successMsg}
        <div class="user-mgmt-banner success">{successMsg}</div>
      {/if}
      {#if warningMsg}
        <div class="user-mgmt-banner warning">{warningMsg}</div>
      {/if}
      {#if errorMsg}
        <div class="user-mgmt-banner error">{errorMsg}</div>
      {/if}

      <form on:submit|preventDefault={handleCreateUser}>
        <div class="user-mgmt-field">
          <label for="email">{$t("admin.users.emailLabel")}</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder={$t("admin.users.emailPlaceholder")}
            autocomplete="off"
            required
          />
        </div>

        <div class="user-mgmt-field">
          <label for="role">{$t("admin.users.roleLabel")}</label>
          <select id="role" bind:value={role}>
            <option value="teacher">{$t("admin.users.roleTeacher")}</option>
            <option value="admin">{$t("admin.users.roleAdmin")}</option>
          </select>
          <small>{$t("admin.users.adminHint")}</small>
        </div>

        <button class="user-mgmt-primary-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? $t("admin.users.creating") : $t("admin.users.createButton")}
        </button>
      </form>
    </div>
  {/if}
</div>
