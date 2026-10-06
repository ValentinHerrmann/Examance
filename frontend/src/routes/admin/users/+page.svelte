<script lang="ts">
  // Account administration (issue #53): registrations awaiting approval, invitations, per-account
  // feature switches and always-allowed domains. Data loading and handlers live here; the components in
  // lib/components/admin hold the markup.
  import { onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { apiErrorMessage } from "#lib/api/client";
  import {
    addAllowedDomain,
    approveUser,
    deleteUser,
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
  import { refreshCapabilities } from "#lib/db/workspace";
  import { t, translate, type TranslationKey } from "#lib/i18n";
  import { faEnvelope, faGlobe, faUserCheck, faUsers } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Button, Card, Checkbox, ConfirmDialog, PageHeader, PageShell, Tabs } from "#lib/components/ui";
  import { safeLocalStorage } from "#lib/utils/storage";
  import PendingAccounts from "#lib/components/admin/PendingAccounts.svelte";
  import AccountList from "#lib/components/admin/AccountList.svelte";
  import InviteForm from "#lib/components/admin/InviteForm.svelte";
  import AllowedDomains from "#lib/components/admin/AllowedDomains.svelte";

  type Notice = { severity: "success" | "warning" | "danger"; text: string } | null;
  type Section = "pending" | "accounts" | "invite" | "domains";

  let users = $state.raw<AdminUser[]>([]);
  let domains = $state.raw<AllowedDomain[]>([]);
  let loading = $state(true);
  let loadError = $state("");

  /** Account ids (or the INVITE / DOMAINS forms) with a request in flight. */
  const busy = new SvelteSet<string>();
  const INVITE = "invite";
  const DOMAINS = "domains";
  let notices = $state<Record<Section, Notice>>({ pending: null, accounts: null, invite: null, domains: null });
  let rejecting = $state.raw<AdminUser | null>(null);
  let deleting = $state.raw<AdminUser | null>(null);
  let deleteKeepsExercises = $state(false);

  // One task per tab, so a phone shows one short screen at a time. The choice is remembered per browser.
  const TAB_KEY = "bg_admin_tab";
  const TABS: readonly Section[] = ["pending", "accounts", "invite", "domains"];
  const savedTab = safeLocalStorage.getItem(TAB_KEY) as Section | null;
  let tabChosen = savedTab !== null && TABS.includes(savedTab);
  let tab = $state<Section>(tabChosen && savedTab ? savedTab : "accounts");
  function selectTab(id: string) {
    if (!TABS.includes(id as Section)) return;
    tab = id as Section;
    tabChosen = true;
    safeLocalStorage.setItem(TAB_KEY, id);
  }

  let isAdmin = $derived($isUnlocked && $sessionStore.role === "admin");
  let pending = $derived(users.filter((u) => u.approved_at === null));
  let approved = $derived(users.filter((u) => u.approved_at !== null));

  function replaceUser(updated: AdminUser) {
    users = users.map((u) => (u.id === updated.id ? updated : u));
  }

  function replaceDomain(updated: AllowedDomain) {
    domains = domains.map((d) => (d.id === updated.id ? updated : d));
  }

  async function load() {
    loading = true;
    loadError = "";
    try {
      [users, domains] = await Promise.all([listUsers(), listAllowedDomains()]);
      if (!tabChosen && users.some((u) => u.approved_at === null)) tab = "pending";
    } catch (err) {
      loadError = apiErrorMessage(err, translate("admin.loadFailed"));
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

  /** One admin action: clears the section's notice, marks `id` busy, reports a failure (after `undo`). */
  async function run(
    section: Section,
    id: string,
    failKey: TranslationKey,
    action: () => Promise<void>,
    undo?: () => void,
  ): Promise<boolean> {
    notices[section] = null;
    busy.add(id);
    try {
      await action();
      return true;
    } catch (err) {
      undo?.();
      notices[section] = { severity: "danger", text: apiErrorMessage(err, translate(failKey)) };
      return false;
    } finally {
      busy.delete(id);
    }
  }

  const success = (text: string): Notice => ({ severity: "success", text });

  function handleApprove(user: AdminUser, features: AccountFeatures) {
    return run("pending", user.id, "admin.pending.failed", async () => {
      replaceUser(await approveUser(user.id, features));
      notices.pending = success(translate("admin.pending.approved", { email: user.email }));
    });
  }

  async function confirmReject() {
    const user = rejecting;
    if (!user) return;
    await run("pending", user.id, "admin.pending.failed", async () => {
      await rejectUser(user.id);
      users = users.filter((u) => u.id !== user.id);
      notices.pending = success(translate("admin.pending.rejected", { email: user.email }));
    });
    rejecting = null;
  }

  function handleToggleUserFeature(user: AdminUser, key: AccountFeature, value: boolean) {
    // Optimistic; a failure puts the row back.
    replaceUser({ ...user, features: { ...user.features, [key]: value } });
    return run(
      "accounts",
      user.id,
      "admin.accounts.failed",
      async () => {
        replaceUser(await updateUserFeatures(user.id, { [key]: value }));
        // The admin's own switches apply to this tab right away.
        if (user.id === $sessionStore.teacherId) void refreshCapabilities();
      },
      () => replaceUser(user),
    );
  }

  async function confirmDelete() {
    const user = deleting;
    if (!user) return;
    await run("accounts", user.id, "admin.accounts.failed", async () => {
      await deleteUser(user.id, deleteKeepsExercises);
      users = users.filter((u) => u.id !== user.id);
      notices.accounts = success(translate("admin.accounts.deleted", { email: user.email }));
    });
    deleting = null;
  }

  function handleResendInvite(user: AdminUser) {
    return run("accounts", user.id, "admin.accounts.failed", async () => {
      const res = await resendSetPasswordLink(user.id);
      notices.accounts = res.password_reset_sent
        ? success(translate("admin.accounts.resent", { email: user.email }))
        : { severity: "warning", text: translate("admin.accounts.resendMailFailed", { email: user.email }) };
    });
  }

  async function handleInvite(email: string, role: "teacher" | "admin", features: AccountFeatures): Promise<boolean> {
    if (!email) {
      notices.invite = { severity: "danger", text: translate("admin.users.emailRequired") };
      return false;
    }
    const sent = await run("invite", INVITE, "admin.users.createFailed", async () => {
      const created = await inviteUser(email, role, features);
      const roleLabel = translate(role === "admin" ? "admin.users.roleAdmin" : "admin.users.roleTeacher");
      notices.invite = created.password_reset_sent
        ? success(translate("admin.users.createdSuccess", { role: roleLabel, email }))
        : { severity: "warning", text: translate("admin.users.createdWarning", { role: roleLabel, email }) };
    });
    // The invitation went out; a failed refresh only leaves the list as it was.
    if (sent) users = await listUsers().catch(() => users);
    return sent;
  }

  function handleAddDomain(domain: string, features: AccountFeatures): Promise<boolean> {
    return run("domains", DOMAINS, "admin.domains.failed", async () => {
      const added = await addAllowedDomain(domain, features);
      domains = [...domains, added].sort((a, b) => a.domain.localeCompare(b.domain));
    });
  }

  function handleToggleDomainFeature(domain: AllowedDomain, key: AccountFeature, value: boolean) {
    replaceDomain({ ...domain, features: { ...domain.features, [key]: value } });
    return run(
      "domains",
      DOMAINS,
      "admin.domains.failed",
      async () => replaceDomain(await updateAllowedDomain(domain.id, { [key]: value })),
      () => replaceDomain(domain),
    );
  }

  function handleRemoveDomain(domain: AllowedDomain) {
    return run("domains", DOMAINS, "admin.domains.failed", async () => {
      await removeAllowedDomain(domain.id);
      domains = domains.filter((d) => d.id !== domain.id);
    });
  }
</script>

{#snippet heading(section: Section)}
  <h2 class="m-0 mb-1 text-lg font-semibold text-content">{$t(`admin.${section}.title`)}</h2>
  <p class="m-0 mb-4 text-sm text-muted">{$t(`admin.${section}.intro`)}</p>
  {#if notices[section]}<Alert severity={notices[section].severity} class="mb-4">{notices[section].text}</Alert>{/if}
{/snippet}

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

      <Tabs
        label={$t("admin.users.pageTitle")}
        value={tab}
        onChange={selectTab}
        compact
        items={[
          { id: "pending", label: $t("admin.tabs.pending"), icon: faUserCheck, count: pending.length },
          { id: "accounts", label: $t("admin.tabs.accounts"), icon: faUsers },
          { id: "invite", label: $t("admin.tabs.invite"), icon: faEnvelope },
          { id: "domains", label: $t("admin.tabs.domains"), icon: faGlobe },
        ]}
      />

      {#if tab === "pending"}
        <Card class="min-w-0">
          {@render heading("pending")}
          {#if loading}
            <p class="m-0 text-sm text-muted">{$t("admin.loading")}</p>
          {:else}
            <PendingAccounts
              users={pending}
              {busy}
              onApprove={handleApprove}
              onReject={(user) => (rejecting = user)}
            />
          {/if}
        </Card>
      {:else if tab === "accounts"}
        <Card class="min-w-0">
          {@render heading("accounts")}
          {#if loading}
            <p class="m-0 text-sm text-muted">{$t("admin.loading")}</p>
          {:else}
            <AccountList
              users={approved}
              {busy}
              onToggleFeature={handleToggleUserFeature}
              onResendInvite={handleResendInvite}
              ownId={$sessionStore.teacherId}
              onDelete={(user) => {
                deleteKeepsExercises = false;
                deleting = user;
              }}
            />
          {/if}
        </Card>
      {:else if tab === "invite"}
        <Card class="min-w-0 md:max-w-form">
          {@render heading("invite")}
          <InviteForm
            busy={busy.has(INVITE)}
            onInvite={handleInvite}
            onDirty={(dirty) => sessionStore.setDirty(dirty)}
          />
        </Card>
      {:else}
        <Card class="min-w-0">
          {@render heading("domains")}
          <AllowedDomains
            {domains}
            busy={busy.has(DOMAINS)}
            onAdd={handleAddDomain}
            onToggleFeature={handleToggleDomainFeature}
            onRemove={handleRemoveDomain}
          />
        </Card>
      {/if}
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
  busy={busy.size > 0}
  onConfirm={confirmReject}
  onCancel={() => (rejecting = null)}
/>

<ConfirmDialog
  open={deleting !== null}
  title={$t("admin.accounts.deleteTitle")}
  message={$t("admin.accounts.deleteMessage", { email: deleting?.email ?? "" })}
  confirmText={$t("admin.accounts.delete")}
  cancelText={$t("common.cancel")}
  severity="danger"
  busy={busy.size > 0}
  onConfirm={confirmDelete}
  onCancel={() => (deleting = null)}
>
  <Checkbox bind:checked={deleteKeepsExercises} disabled={busy.size > 0} label={$t("admin.accounts.keepExercises")} />
</ConfirmDialog>
