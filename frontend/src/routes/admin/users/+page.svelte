<script lang="ts">
  // Account administration (issue #53): registrations awaiting approval, invitations, per-account
  // feature switches and always-allowed domains. Data loading and handlers live here; the components in
  // lib/components/admin hold the markup.
  import { onMount } from "svelte";
  import { ApiError } from "#lib/api/client";
  import {
    addAllowedDomain,
    approveUser,
    inviteUser,
    listAllowedDomains,
    listUsers,
    rejectUser,
    removeAllowedDomain,
    resendSetPasswordLink,
    updateAllowedDomain,
    updateUserFeatures,
    type AccountFeature,
    type AccountFeatures,
    type AdminUser,
    type AllowedDomain,
  } from "#lib/api/admin";
  import { awaitSessionReady, isUnlocked, sessionStore } from "#lib/stores/session";
  import { t, translate } from "#lib/i18n";
  import { Alert, Badge, Button, Card, ConfirmDialog, PageHeader, PageShell } from "#lib/components/ui";
  import PendingAccounts from "#lib/components/admin/PendingAccounts.svelte";
  import AccountList from "#lib/components/admin/AccountList.svelte";
  import InviteForm from "#lib/components/admin/InviteForm.svelte";
  import AllowedDomains from "#lib/components/admin/AllowedDomains.svelte";

  type Notice = { severity: "success" | "warning" | "danger"; text: string } | null;

  let users = $state.raw<AdminUser[]>([]);
  let domains = $state.raw<AllowedDomain[]>([]);
  let loading = $state(true);
  let loadError = $state("");

  let busyUserId = $state<string | null>(null);
  let inviteBusy = $state(false);
  let domainsBusy = $state(false);
  let pendingNotice: Notice = $state(null);
  let inviteNotice: Notice = $state(null);
  let accountsNotice: Notice = $state(null);
  let domainsNotice: Notice = $state(null);
  let rejecting = $state.raw<AdminUser | null>(null);

  let isAdmin = $derived($isUnlocked && $sessionStore.role === "admin");
  let pending = $derived(users.filter((u) => u.approved_at === null));
  let approved = $derived(users.filter((u) => u.approved_at !== null));

  function messageOf(err: unknown, fallback: string): string {
    return err instanceof ApiError ? err.message : fallback;
  }

  function replaceUser(updated: AdminUser) {
    users = users.map((u) => (u.id === updated.id ? updated : u));
  }

  async function load() {
    loading = true;
    loadError = "";
    try {
      [users, domains] = await Promise.all([listUsers("all"), listAllowedDomains()]);
    } catch (err) {
      loadError = messageOf(err, translate("admin.loadFailed"));
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await awaitSessionReady();
    if (!$isUnlocked) {
      window.location.href = "/unlock";
      return;
    }
    if (isAdmin) await load();
  });

  async function handleApprove(user: AdminUser, features: AccountFeatures) {
    pendingNotice = null;
    busyUserId = user.id;
    try {
      replaceUser(await approveUser(user.id, features));
      pendingNotice = { severity: "success", text: translate("admin.pending.approved", { email: user.email }) };
    } catch (err) {
      pendingNotice = { severity: "danger", text: messageOf(err, translate("admin.pending.failed")) };
    } finally {
      busyUserId = null;
    }
  }

  async function confirmReject() {
    const user = rejecting;
    if (!user) return;
    pendingNotice = null;
    busyUserId = user.id;
    try {
      await rejectUser(user.id);
      users = users.filter((u) => u.id !== user.id);
      pendingNotice = { severity: "success", text: translate("admin.pending.rejected", { email: user.email }) };
    } catch (err) {
      pendingNotice = { severity: "danger", text: messageOf(err, translate("admin.pending.failed")) };
    } finally {
      busyUserId = null;
      rejecting = null;
    }
  }

  async function handleToggleUserFeature(user: AdminUser, key: AccountFeature, value: boolean) {
    accountsNotice = null;
    // Optimistic, and reverted by value on failure so the switch follows the real state.
    replaceUser({ ...user, features: { ...user.features, [key]: value } });
    busyUserId = user.id;
    try {
      replaceUser(await updateUserFeatures(user.id, { [key]: value }));
    } catch (err) {
      replaceUser(user);
      accountsNotice = { severity: "danger", text: messageOf(err, translate("admin.accounts.failed")) };
    } finally {
      busyUserId = null;
    }
  }

  async function handleResendInvite(user: AdminUser) {
    accountsNotice = null;
    busyUserId = user.id;
    try {
      const res = await resendSetPasswordLink(user.id);
      accountsNotice = res.password_reset_sent
        ? { severity: "success", text: translate("admin.accounts.resent", { email: user.email }) }
        : { severity: "warning", text: translate("admin.accounts.resendMailFailed", { email: user.email }) };
    } catch (err) {
      accountsNotice = { severity: "danger", text: messageOf(err, translate("admin.accounts.failed")) };
    } finally {
      busyUserId = null;
    }
  }

  async function handleInvite(email: string, role: "teacher" | "admin", features: AccountFeatures): Promise<boolean> {
    inviteNotice = null;
    if (!email) {
      inviteNotice = { severity: "danger", text: translate("admin.users.emailRequired") };
      return false;
    }
    inviteBusy = true;
    try {
      const created = await inviteUser(email, role, features);
      const roleLabel = role === "admin" ? translate("admin.users.roleAdmin") : translate("admin.users.roleTeacher");
      inviteNotice = created.password_reset_sent
        ? { severity: "success", text: translate("admin.users.createdSuccess", { role: roleLabel, email }) }
        : { severity: "warning", text: translate("admin.users.createdWarning", { role: roleLabel, email }) };
      sessionStore.setDirty(false);
      users = await listUsers("all");
      return true;
    } catch (err) {
      inviteNotice = { severity: "danger", text: messageOf(err, translate("admin.users.createFailed")) };
      return false;
    } finally {
      inviteBusy = false;
    }
  }

  async function handleAddDomain(domain: string, features: AccountFeatures): Promise<boolean> {
    domainsNotice = null;
    domainsBusy = true;
    try {
      const added = await addAllowedDomain(domain, features);
      domains = [...domains, added].sort((a, b) => a.domain.localeCompare(b.domain));
      return true;
    } catch (err) {
      domainsNotice = { severity: "danger", text: messageOf(err, translate("admin.domains.failed")) };
      return false;
    } finally {
      domainsBusy = false;
    }
  }

  async function handleToggleDomainFeature(domain: AllowedDomain, key: AccountFeature, value: boolean) {
    domainsNotice = null;
    const replace = (next: AllowedDomain) => (domains = domains.map((d) => (d.id === next.id ? next : d)));
    replace({ ...domain, features: { ...domain.features, [key]: value } });
    domainsBusy = true;
    try {
      replace(await updateAllowedDomain(domain.id, { [key]: value }));
    } catch (err) {
      replace(domain);
      domainsNotice = { severity: "danger", text: messageOf(err, translate("admin.domains.failed")) };
    } finally {
      domainsBusy = false;
    }
  }

  async function handleRemoveDomain(domain: AllowedDomain) {
    domainsNotice = null;
    domainsBusy = true;
    try {
      await removeAllowedDomain(domain.id);
      domains = domains.filter((d) => d.id !== domain.id);
    } catch (err) {
      domainsNotice = { severity: "danger", text: messageOf(err, translate("admin.domains.failed")) };
    } finally {
      domainsBusy = false;
    }
  }
</script>

<PageShell width="wide">
  <PageHeader title={$t("admin.users.pageTitle")} subtitle={$t("admin.users.pageSubtitle")} helpTopic="accounts" />

  {#if !$isUnlocked}
    <Card class="max-w-narrow">
      <p class="mt-0 mb-4">{$t("admin.users.locked")}</p>
      <Button href="/unlock">{$t("admin.users.goToUnlock")}</Button>
    </Card>
  {:else if $sessionStore.role !== "admin"}
    <Card tone="danger" class="max-w-narrow">
      <p class="m-0">{$t("admin.users.roleRequired")}</p>
      <p class="mt-1 mb-0 text-sm text-muted">{$t("admin.users.roleRequiredSub")}</p>
    </Card>
  {:else}
    <div class="flex min-w-0 flex-col gap-5">
      {#if loadError}
        <Alert severity="danger">
          {loadError}
          <Button size="sm" variant="text" class="ml-2" onClick={load}>{$t("admin.retry")}</Button>
        </Alert>
      {/if}

      <Card>
        <h2 class="m-0 mb-1 flex items-center gap-2 text-lg font-semibold text-content">
          {$t("admin.pending.title")}
          {#if pending.length > 0}<Badge severity="warning" size="xs">{pending.length}</Badge>{/if}
        </h2>
        <p class="m-0 mb-4 text-sm text-muted">{$t("admin.pending.intro")}</p>
        {#if pendingNotice}<Alert severity={pendingNotice.severity} class="mb-4">{pendingNotice.text}</Alert>{/if}
        {#if loading}
          <p class="m-0 text-sm text-muted">{$t("admin.loading")}</p>
        {:else}
          <PendingAccounts
            users={pending}
            busyId={busyUserId}
            onApprove={handleApprove}
            onReject={(user) => (rejecting = user)}
          />
        {/if}
      </Card>

      <div class="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card class="min-w-0">
          <h2 class="m-0 mb-1 text-lg font-semibold text-content">{$t("admin.invite.title")}</h2>
          <p class="m-0 mb-4 text-sm text-muted">{$t("admin.invite.intro")}</p>
          {#if inviteNotice}<Alert severity={inviteNotice.severity} class="mb-4">{inviteNotice.text}</Alert>{/if}
          <InviteForm
            busy={inviteBusy}
            onInvite={handleInvite}
            onDirty={(dirty) => sessionStore.setDirty(dirty)}
          />
        </Card>

        <Card class="min-w-0">
          <h2 class="m-0 mb-1 text-lg font-semibold text-content">{$t("admin.domains.title")}</h2>
          <p class="m-0 mb-4 text-sm text-muted">{$t("admin.domains.intro")}</p>
          {#if domainsNotice}<Alert severity={domainsNotice.severity} class="mb-4">{domainsNotice.text}</Alert>{/if}
          <AllowedDomains
            {domains}
            busy={domainsBusy}
            onAdd={handleAddDomain}
            onToggleFeature={handleToggleDomainFeature}
            onRemove={handleRemoveDomain}
          />
        </Card>
      </div>

      <Card>
        <h2 class="m-0 mb-1 text-lg font-semibold text-content">{$t("admin.accounts.title")}</h2>
        <p class="m-0 mb-4 text-sm text-muted">{$t("admin.accounts.intro")}</p>
        {#if accountsNotice}<Alert severity={accountsNotice.severity} class="mb-4">{accountsNotice.text}</Alert>{/if}
        {#if loading}
          <p class="m-0 text-sm text-muted">{$t("admin.loading")}</p>
        {:else}
          <AccountList
            users={approved}
            busyId={busyUserId}
            onToggleFeature={handleToggleUserFeature}
            onResendInvite={handleResendInvite}
          />
        {/if}
      </Card>
    </div>
  {/if}
</PageShell>

<ConfirmDialog
  open={rejecting !== null}
  title={$t("admin.pending.rejectTitle")}
  message={$t("admin.pending.rejectMessage", { email: rejecting?.email ?? "" })}
  confirmText={$t("admin.pending.reject")}
  cancelText={$t("common.cancel")}
  severity="danger"
  busy={busyUserId !== null}
  onConfirm={confirmReject}
  onCancel={() => (rejecting = null)}
/>
