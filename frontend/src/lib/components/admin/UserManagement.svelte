<script lang="ts">
  import "./UserManagement.css";
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client';
  import { isUnlocked, sessionStore } from '$lib/stores/session';

  type UserRole = 'teacher' | 'admin';

  let email = '';
  let password = '';
  let role: UserRole = 'teacher';

  let isSubmitting = false;
  let errorMsg = '';
  let successMsg = '';

  $: canAccess = $isUnlocked && $sessionStore.role === 'admin';

  $: {
    if (email.trim() || password) {
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
    if (!normalizedEmail) return 'Email is required.';
    if (!password) return 'Password is required.';
    if (password.length < 12) return 'Password must be at least 12 characters long.';
    return null;
  }

  async function handleCreateUser() {
    errorMsg = '';
    successMsg = '';

    if (!canAccess) {
      errorMsg = 'Admin access is required.';
      return;
    }

    const validationError = validate();
    if (validationError) {
      errorMsg = validationError;
      return;
    }

    isSubmitting = true;
    try {
      const payload = { email: email.trim(), password, role };
      const created = await api.post<{ id: string; email: string; role: UserRole }>(
        '/admin/users',
        payload
      );

      successMsg = `Created ${created.role} account for ${created.email}.`;
      password = '';
      sessionStore.setDirty(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          errorMsg = 'Only admins can create users.';
        } else if (err.status === 409) {
          errorMsg = 'A user with this email already exists.';
        } else {
          errorMsg = err.message;
        }
      } else {
        errorMsg = 'Failed to create user. Please try again.';
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="admin-users-page">
  <div class="user-mgmt-header">
    <h2>User Management</h2>
    <p>Create teacher or admin accounts for Hybrid Server Mode.</p>
  </div>

  {#if !$isUnlocked}
    <div class="user-mgmt-state-card">
      <p>Session is locked. Unlock to continue.</p>
      <a href="/unlock" class="user-mgmt-primary-link">Go to Unlock</a>
    </div>
  {:else if $sessionStore.role !== 'admin'}
    <div class="user-mgmt-state-card danger">
      <p>Admin role required.</p>
      <p class="user-mgmt-sub">Sign in with an admin account to create users.</p>
    </div>
  {:else}
    <div class="user-mgmt-form-card">
      {#if successMsg}
        <div class="user-mgmt-banner success">{successMsg}</div>
      {/if}
      {#if errorMsg}
        <div class="user-mgmt-banner error">{errorMsg}</div>
      {/if}

      <form on:submit|preventDefault={handleCreateUser}>
        <div class="user-mgmt-field">
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="teacher@school.example"
            autocomplete="off"
            required
          />
        </div>

        <div class="user-mgmt-field">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="At least 12 characters"
            autocomplete="new-password"
            required
            minlength="12"
          />
          <small>Stored only as Argon2id hash on server.</small>
        </div>

        <div class="user-mgmt-field">
          <label for="role">Role</label>
          <select id="role" bind:value={role}>
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
          <small>Create admin accounts only when operationally necessary.</small>
        </div>

        <button class="user-mgmt-primary-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating User...' : 'Create User'}
        </button>
      </form>
    </div>
  {/if}
</div>
