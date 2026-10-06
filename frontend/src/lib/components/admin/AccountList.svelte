<script lang="ts">
  // Approved accounts with their feature switches (issue #53). Turning `server_results` off for an all-server account
  // touches no data: it is asked to move its results into the browser the next time it opens. One row per account on
  // phones, table from `md`; any account but the admin's own can be deleted (own: settings page).
  import { faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
  import { ACCOUNT_FEATURES, FEATURE_COLUMNS, type AccountFeature, type AdminUser } from "#lib/api/admin";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Badge, Button, Icon, Switch, TableScroller, TextInput } from "#lib/components/ui";
  import FeatureSwitches from "./FeatureSwitches.svelte";

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
      <!-- Phones and small tablets: one row per account. -->
      <ul class="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
        {#each shown as user (user.id)}
          <li class="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface-base p-4">
            <div class="flex min-w-0 flex-col gap-1.5">
              <strong class="min-w-0 break-words text-content">{user.email}</strong>
              <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>{@render roleText(user)}</span>
                {@render statusBadge(user)}
              </div>
            </div>
            <FeatureSwitches
              features={user.features}
              disabled={busy.has(user.id)}
              compact
              onChange={(key, value) => onToggleFeature(user, key, value)}
            />
            {#if !user.password_set}
              <Button
                size="sm"
                variant="outlined"
                block
                disabled={busy.has(user.id)}
                onClick={() => onResendInvite(user)}
              >
                {$t("admin.accounts.resendInvite")}
              </Button>
            {/if}
            {#if user.id !== ownId}
              <Button
                size="sm"
                variant="outlined"
                severity="danger"
                icon={faTrash}
                block
                disabled={busy.size > 0}
                onClick={() => onDelete(user)}
              >
                {$t("admin.accounts.delete")}
              </Button>
            {/if}
          </li>
        {/each}
      </ul>

      <!-- From md: the table. -->
      <div class="hidden min-w-0 md:block">
        <TableScroller label={$t("admin.accounts.title")}>
          <table class="data-table data-table-compact data-table-hover w-full">
            <thead>
              <tr>
                <th>{$t("admin.users.emailLabel")}</th>
                <th>{$t("admin.users.roleLabel")}</th>
                <th>{$t("admin.accounts.columnStatus")}</th>
                {#each ACCOUNT_FEATURES as key (key)}
                  <th>{$t(FEATURE_COLUMNS[key])}</th>
                {/each}
                <th><span class="sr-only">{$t("admin.accounts.columnActions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {#each shown as user (user.id)}
                <tr>
                  <td class="break-words text-content">{user.email}</td>
                  <td class="whitespace-nowrap">{@render roleText(user)}</td>
                  <td class="whitespace-nowrap">{@render statusBadge(user)}</td>
                  {#each ACCOUNT_FEATURES as key (key)}
                    <td>
                      <Switch
                        checked={user.features[key]}
                        disabled={busy.has(user.id)}
                        ariaLabel={`${$t(FEATURE_COLUMNS[key])}: ${user.email}`}
                        onChange={(value) => onToggleFeature(user, key, value)}
                      />
                    </td>
                  {/each}
                  <td class="text-right whitespace-nowrap">
                    {#if !user.password_set}
                      <Button size="sm" variant="text" disabled={busy.has(user.id)} onClick={() => onResendInvite(user)}>
                        {$t("admin.accounts.resendInvite")}
                      </Button>
                    {/if}
                    {#if user.id !== ownId}
                      <Button
                        iconOnly
                        icon={faTrash}
                        variant="text"
                        severity="danger"
                        size="sm"
                        ariaLabel={$t("admin.accounts.deleteLabel", { email: user.email })}
                        disabled={busy.size > 0}
                        onClick={() => onDelete(user)}
                      />
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </TableScroller>
      </div>
    {/if}
  </div>
{/if}
