<script lang="ts">
  // Approved accounts with their feature switches (issue #53). Turning `server_results` off for an
  // account in all-server mode touches no data: the next time it opens, the app asks it to move its
  // results into the browser.
  import { ACCOUNT_FEATURES, type AccountFeature, type AdminUser } from "#lib/api/admin";
  import { t, type TranslationKey } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Badge, Button, Switch, TableScroller } from "#lib/components/ui";

  interface Props {
    users: AdminUser[];
    /** The account a change is running for. */
    busyId: string | null;
    onToggleFeature: (user: AdminUser, key: AccountFeature, value: boolean) => void;
    onResendInvite: (user: AdminUser) => void;
  }

  let { users, busyId, onToggleFeature, onResendInvite }: Props = $props();

  const COLUMN: Record<AccountFeature, TranslationKey> = {
    server_results: "admin.accounts.columnResults",
    server_latex: "admin.accounts.columnLatex",
  };
</script>

{#if users.length === 0}
  <p class="m-0 text-sm text-muted">{$t("admin.accounts.empty")}</p>
{:else}
  <TableScroller label={$t("admin.accounts.title")}>
    <table class="data-table data-table-compact data-table-hover w-full">
      <thead>
        <tr>
          <th>{$t("admin.users.emailLabel")}</th>
          <th>{$t("admin.users.roleLabel")}</th>
          <th>{$t("admin.accounts.columnStatus")}</th>
          {#each ACCOUNT_FEATURES as key (key)}
            <th>{$t(COLUMN[key])}</th>
          {/each}
          <th><span class="sr-only">{$t("admin.accounts.columnActions")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each users as user (user.id)}
          <tr>
            <td class="break-all text-content">{user.email}</td>
            <td class="whitespace-nowrap">
              {user.role === "admin" ? $t("admin.users.roleAdmin") : $t("admin.users.roleTeacher")}
            </td>
            <td class="whitespace-nowrap">
              {#if user.password_set}
                <Badge severity="success" size="xs" title={user.approved_at ? $fmt.date(user.approved_at) : undefined}>
                  {$t("admin.accounts.statusActive")}
                </Badge>
              {:else}
                <Badge severity="warning" size="xs">{$t("admin.accounts.statusInvited")}</Badge>
              {/if}
            </td>
            {#each ACCOUNT_FEATURES as key (key)}
              <td>
                <Switch
                  checked={user.features[key]}
                  disabled={busyId === user.id}
                  ariaLabel={`${$t(COLUMN[key])}: ${user.email}`}
                  onChange={(value) => onToggleFeature(user, key, value)}
                />
              </td>
            {/each}
            <td class="text-right whitespace-nowrap">
              {#if !user.password_set}
                <Button size="sm" variant="text" disabled={busyId === user.id} onClick={() => onResendInvite(user)}>
                  {$t("admin.accounts.resendInvite")}
                </Button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </TableScroller>
{/if}
