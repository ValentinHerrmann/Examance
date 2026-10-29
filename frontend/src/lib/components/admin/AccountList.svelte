<script lang="ts">
  // Approved accounts with their feature switches (issue #53). Turning `server_results` off for an all-server account
  // touches no data: it is asked to move its results into the browser the next time it opens. One row per account on
  // phones, table from `md`; any account but the admin's own can be deleted (own: settings page).
  import { faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
  import type { AccountFeature, AdminUser } from "#lib/api/admin";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Badge, Button, Icon, TextInput } from "#lib/components/ui";
  import FeatureMatrix from "./FeatureMatrix.svelte";

  interface Props {
    users: AdminUser[];
    /** The account a change is running for. */
    /** Accounts with a request in flight. */
    busy: ReadonlySet<string>;
    onToggleFeature: (user: AdminUser, key: AccountFeature, value: boolean) => void;
    onResendInvite: (user: AdminUser) => void;
    /** The signed-in admin's account, which cannot be deleted here. */
    ownId: string | null;
    onDelete: (user: AdminUser) => void;
  }

  let { users, busy, onToggleFeature, onResendInvite, ownId, onDelete }: Props = $props();

  let query = $state("");
  let shown = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return needle ? users.filter((u) => u.email.toLowerCase().includes(needle)) : users;
  });
</script>

{#snippet roleText(user: AdminUser)}
  {user.role === "admin" ? $t("admin.users.roleAdmin") : $t("admin.users.roleTeacher")}
{/snippet}

{#snippet statusBadge(user: AdminUser)}
  {#if user.password_set}
    <Badge severity="success" size="xs" title={user.approved_at ? $fmt.date(user.approved_at) : undefined}>
      {$t("admin.accounts.statusActive")}
    </Badge>
  {:else}
    <Badge severity="warning" size="xs">{$t("admin.accounts.statusInvited")}</Badge>
  {/if}
{/snippet}

{#snippet identity(user: AdminUser)}{user.email}{/snippet}

<!-- Cards get inline pieces, the table its own cells. -->
{#snippet meta(user: AdminUser, card: boolean)}
  {#if card}
    <span>{@render roleText(user)}</span>
    {@render statusBadge(user)}
  {:else}
    <td class="whitespace-nowrap">{@render roleText(user)}</td>
    <td class="whitespace-nowrap">{@render statusBadge(user)}</td>
  {/if}
{/snippet}

{#snippet actions(user: AdminUser, card: boolean)}
  {@const variant = card ? "outlined" : "text"}
  {#if !user.password_set}
    <Button size="sm" {variant} block={card} disabled={busy.has(user.id)} onClick={() => onResendInvite(user)}>
      {$t("admin.accounts.resendInvite")}
    </Button>
  {/if}
  {#if user.id !== ownId}
    <Button
      size="sm"
      {variant}
      severity="danger"
      icon={faTrash}
      iconOnly={!card}
      block={card}
      ariaLabel={card ? undefined : $t("admin.accounts.deleteLabel", { email: user.email })}
      disabled={busy.size > 0}
      onClick={() => onDelete(user)}
    >
      {$t("admin.accounts.delete")}
    </Button>
  {/if}
{/snippet}

{#if users.length === 0}
  <p class="m-0 text-sm text-muted">{$t("admin.accounts.empty")}</p>
{:else}
  <div class="flex min-w-0 flex-col gap-4">
    <label class="relative block min-w-0 md:max-w-sm">
      <span class="sr-only">{$t("admin.accounts.search")}</span>
      <Icon icon={faMagnifyingGlass} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <TextInput type="search" bind:value={query} placeholder={$t("admin.accounts.search")} class="pl-9" />
    </label>

    {#if shown.length === 0}
      <p class="m-0 text-sm text-muted">{$t("admin.accounts.noMatch")}</p>
    {:else}
      <FeatureMatrix
        rows={shown}
        rowLabel={(user) => user.email}
        tableLabel={$t("admin.accounts.title")}
        headers={[$t("admin.users.emailLabel"), $t("admin.users.roleLabel"), $t("admin.accounts.columnStatus")]}
        hover
        disabled={(user) => busy.has(user.id)}
        onToggle={onToggleFeature}
        {identity}
        {meta}
        {actions}
      />
    {/if}
  </div>
{/if}
