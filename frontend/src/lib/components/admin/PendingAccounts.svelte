<script lang="ts">
  // Self-registrations waiting for an admin (issue #53): the address is verified and the password set;
  // approving chooses the account's features, rejecting deletes it and tells the registrant.
  import { ALL_FEATURES_ON, type AccountFeatures, type AdminUser } from "#lib/api/admin";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Button } from "#lib/components/ui";
  import FeatureSwitches from "./FeatureSwitches.svelte";

  interface Props {
    users: AdminUser[];
    /** The account an approve/reject is running for. */
    busyId: string | null;
    onApprove: (user: AdminUser, features: AccountFeatures) => void;
    onReject: (user: AdminUser) => void;
  }

  let { users, busyId, onApprove, onReject }: Props = $props();

  /** Features chosen per pending account before approving; everything on until the admin changes it. */
  let drafts = $state<Record<string, AccountFeatures>>({});

  function draftFor(id: string): AccountFeatures {
    return drafts[id] ?? ALL_FEATURES_ON;
  }
</script>

{#if users.length === 0}
  <p class="m-0 text-sm text-muted">{$t("admin.pending.empty")}</p>
{:else}
  <ul class="m-0 flex list-none flex-col gap-3 p-0">
    {#each users as user (user.id)}
      <li class="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface-base p-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
          <strong class="min-w-0 break-words text-content">{user.email}</strong>
          <span class="text-xs text-muted">{$t("admin.pending.registeredAt", { date: $fmt.dateTime(user.created_at) })}</span>
          {#if user.registration_note}
            <blockquote class="m-0 mt-1 border-l-2 border-line pl-3 text-sm break-words whitespace-pre-line text-content">
              {user.registration_note}
            </blockquote>
          {:else}
            <span class="text-sm text-muted">{$t("admin.pending.noNote")}</span>
          {/if}
        </div>
        <div class="flex min-w-0 shrink-0 flex-col gap-3 lg:w-72">
          <FeatureSwitches
            features={draftFor(user.id)}
            disabled={busyId === user.id}
            onChange={(key, value) => (drafts = { ...drafts, [user.id]: { ...draftFor(user.id), [key]: value } })}
          />
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              size="sm"
              class="w-full sm:w-auto"
              loading={busyId === user.id}
              disabled={busyId !== null}
              onClick={() => onApprove(user, draftFor(user.id))}
            >
              {$t("admin.pending.approve")}
            </Button>
            <Button
              size="sm"
              class="w-full sm:w-auto"
              variant="outlined"
              severity="danger"
              disabled={busyId !== null}
              onClick={() => onReject(user)}
            >
              {$t("admin.pending.reject")}
            </Button>
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}
