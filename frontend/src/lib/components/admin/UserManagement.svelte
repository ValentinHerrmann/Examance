<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api, ApiError } from '$lib/api/client';
  import { isUnlocked, sessionStore } from '$lib/stores/session';
  import { t, translate } from '$lib/i18n';
  import { PageShell, PageHeader, Card, Button, Alert, Field, TextInput, Select } from '$lib/components/ui';

  type UserRole = 'teacher' | 'admin';

  let email = $state('');
  let role: UserRole = $state('teacher');

  let isSubmitting = $state(false);
  let errorMsg = $state('');
  let warningMsg = $state('');
  let successMsg = $state('');

  let canAccess = $derived($isUnlocked && $sessionStore.role === 'admin');

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

  $effect.pre(() => {
    const value = email;
    if (value.trim()) {
      untrack(() => sessionStore.setDirty(true));
    }
  });
</script>

<PageShell width="fluid">
  <PageHeader title={$t("admin.users.pageTitle")} subtitle={$t("admin.users.pageSubtitle")} />

  {#if !$isUnlocked}
    <Card class="max-w-narrow">
      <p class="mt-0 mb-4">{$t("admin.users.locked")}</p>
      <Button href="/unlock">{$t("admin.users.goToUnlock")}</Button>
    </Card>
  {:else if $sessionStore.role !== 'admin'}
    <Card tone="danger" class="max-w-narrow">
      <p class="m-0">{$t("admin.users.roleRequired")}</p>
      <p class="mt-1 mb-0 text-sm text-muted">{$t("admin.users.roleRequiredSub")}</p>
    </Card>
  {:else}
    <Card class="max-w-narrow">
      {#if successMsg || warningMsg || errorMsg}
      <div class="flex flex-col gap-3">
        {#if successMsg}
          <Alert severity="success">{successMsg}</Alert>
        {/if}
        {#if warningMsg}
          <Alert severity="warning">{warningMsg}</Alert>
        {/if}
        {#if errorMsg}
          <Alert severity="danger">{errorMsg}</Alert>
        {/if}
      </div>
      {/if}

      <form class="mt-4 flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); handleCreateUser(); }}>
        <Field label={$t("admin.users.emailLabel")} forId="email">
          <TextInput
            id="email"
            type="email"
            bind:value={email}
            placeholder={$t("admin.users.emailPlaceholder")}
            autocomplete="off"
            required
          />
        </Field>

        <Field label={$t("admin.users.roleLabel")} forId="role" hint={$t("admin.users.adminHint")}>
          <Select id="role" bind:value={role}>
            <option value="teacher">{$t("admin.users.roleTeacher")}</option>
            <option value="admin">{$t("admin.users.roleAdmin")}</option>
          </Select>
        </Field>

        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? $t("admin.users.creating") : $t("admin.users.createButton")}
          </Button>
        </div>
      </form>
    </Card>
  {/if}
</PageShell>
