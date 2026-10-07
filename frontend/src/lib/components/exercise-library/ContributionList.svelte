<script lang="ts">
  import type { ContributionSummary } from "#lib/api/exerciseContributions";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Badge, Button } from "#lib/components/ui";
  import { faMagnifyingGlass, faRotateLeft } from "@fortawesome/free-solid-svg-icons";

  /** The "Proposals" view: proposals to my shared exercises and the ones I sent (issue #65). */
  interface Props {
    incoming?: ContributionSummary[];
    outgoing?: ContributionSummary[];
    isLoading?: boolean;
    busyId?: string;
    onReview: (item: ContributionSummary) => void;
    onWithdraw: (item: ContributionSummary) => void;
  }

  let { incoming = [], outgoing = [], isLoading = false, busyId = "", onReview, onWithdraw }: Props = $props();

  const statusSeverity = { pending: "warning", accepted: "success", rejected: "danger", withdrawn: "secondary" } as const;
  const statusKey = {
    pending: "exercises.contributions.status.pending",
    accepted: "exercises.contributions.status.accepted",
    rejected: "exercises.contributions.status.rejected",
    withdrawn: "exercises.contributions.status.withdrawn",
  } as const;

  let sortedIncoming = $derived([...incoming].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")));
</script>

{#snippet card(item: ContributionSummary)}
  <li class="flex flex-col gap-2 rounded-xl border border-line bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 break-words font-semibold text-content">{item.exerciseName || $t("exercises.untitled")}</span>
        <Badge severity={item.kind === "variant" ? "info" : "secondary"}>
          {item.kind === "variant" ? $t("exercises.contributions.kindVariant") : $t("exercises.contributions.kindVersion")}
        </Badge>
        {#if item.variantKey}
          <Badge>{item.variantKey}</Badge>
        {/if}
        <Badge severity={statusSeverity[item.status]}>{$t(statusKey[item.status])}</Badge>
        {#if item.status === "pending" && item.direction === "incoming" && (item.stale || item.targetGone)}
          <Badge severity="warning">{item.targetGone ? $t("exercises.contributions.targetGoneShort") : $t("exercises.contributions.staleShort")}</Badge>
        {/if}
      </div>
      <span class="text-xs text-muted">
        {item.direction === "incoming"
          ? $t("exercises.contributions.from", { email: item.counterpartEmail ?? "" })
          : $t("exercises.contributions.to", { email: item.counterpartEmail ?? "" })}
        · {$fmt.date(item.createdAt)}
      </span>
      {#if item.message}
        <span class="min-w-0 break-words text-sm text-content">“{item.message}”</span>
      {/if}
      {#if item.decisionNote}
        <span class="min-w-0 break-words text-sm text-muted">{$t("exercises.contributions.note", { note: item.decisionNote })}</span>
      {/if}
    </div>
    <div class="flex shrink-0 gap-2">
      {#if item.direction === "incoming" && item.status === "pending"}
        <Button size="sm" icon={faMagnifyingGlass} onClick={() => onReview(item)}>{$t("exercises.contributions.review")}</Button>
      {:else if item.direction === "outgoing" && item.status === "pending"}
        <Button variant="outlined" severity="secondary" size="sm" icon={faRotateLeft} loading={busyId === item.id} onClick={() => onWithdraw(item)}>
          {$t("exercises.contributions.withdraw")}
        </Button>
      {/if}
    </div>
  </li>
{/snippet}

{#if isLoading}
  <div class="p-12 text-center text-muted">{$t("exercises.contributions.loading")}</div>
{:else}
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-2">
      <h2 class="m-0 text-base font-semibold text-content">{$t("exercises.contributions.incoming")}</h2>
      {#if sortedIncoming.length === 0}
        <p class="m-0 text-sm text-muted">{$t("exercises.contributions.noIncoming")}</p>
      {:else}
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          {#each sortedIncoming as item (item.id)}{@render card(item)}{/each}
        </ul>
      {/if}
    </section>
    <section class="flex flex-col gap-2">
      <h2 class="m-0 text-base font-semibold text-content">{$t("exercises.contributions.outgoing")}</h2>
      {#if outgoing.length === 0}
        <p class="m-0 text-sm text-muted">{$t("exercises.contributions.noOutgoing")}</p>
      {:else}
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          {#each outgoing as item (item.id)}{@render card(item)}{/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}
