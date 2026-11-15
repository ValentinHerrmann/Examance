<script lang="ts">
  // The objections overview of an exam (Results tab, issue #226): open and answered objections with their conversations, pseudonymous until the teacher reveals names. Read only: nothing here locks an objection.
  import { faCommentDots } from "@fortawesome/free-solid-svg-icons";
  import { browser } from "$app/env";
  import { t } from "#lib/i18n";
  import { Alert, Button, EmptyState, FilterPills, Spinner, Switch } from "#lib/components/ui";
  import { loadReviewOverview, type ReviewOverviewRow } from "#lib/sharing/reviewOverview";
  import { shareHref } from "#lib/utils/links";
  import ReviewOverviewRowCard from "./ReviewOverviewRow.svelte";

  let { examId }: { examId: string } = $props();

  let rows = $state<ReviewOverviewRow[] | null>(null);
  let error = $state("");
  let filter = $state("open");
  // Never persisted: leaving the page hides the names again.
  let namesShown = $state(false);
  let seq = 0;

  let openRows = $derived(rows?.filter((r) => r.status !== "answered") ?? []);
  let answeredRows = $derived(rows?.filter((r) => r.status === "answered") ?? []);
  const ROWS_BY_FILTER: Record<string, () => ReviewOverviewRow[]> = { open: () => openRows, answered: () => answeredRows };
  let shown = $derived(ROWS_BY_FILTER[filter]?.() ?? rows ?? []);

  async function load(id: string) {
    const mine = ++seq;
    rows = null;
    error = "";
    try {
      const loaded = await loadReviewOverview(id);
      if (mine === seq) rows = loaded;
    } catch (err) {
      if (mine === seq) error = err instanceof Error ? err.message : String(err);
    }
  }

  $effect(() => {
    if (browser) load(examId);
  });
</script>

{#if error}
  <Alert severity="danger">{$t("review.overview.loadFailed", { message: error })}</Alert>
{:else if rows === null}
  <div class="flex justify-center p-8"><Spinner /></div>
{:else if rows.length === 0}
  <EmptyState icon={faCommentDots} title={$t("review.overview.emptyTitle")} description={$t("review.overview.emptyText")}>
    {#snippet actions()}
      <Button variant="outlined" severity="secondary" href={shareHref(examId)}>{$t("review.overview.emptyAction")}</Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="flex min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label={$t("review.overview.filterLabel")}>
        <FilterPills
          layout="wrap"
          selected={filter}
          allLabel={$t("review.overview.all")}
          options={[
            { value: "open", label: $t("review.overview.open"), count: openRows.length },
            { value: "answered", label: $t("review.overview.answered"), count: answeredRows.length },
          ]}
          onSelect={(value) => (filter = value)}
        />
      </div>
      <Switch checked={namesShown} label={$t("review.overview.showNames")} onChange={(on) => (namesShown = on)} />
    </div>
    <p class="m-0 text-sm text-muted">{$t("review.overview.hint")}</p>
    {#if shown.length === 0}
      <p class="m-0 text-sm text-muted">{filter === "answered" ? $t("review.overview.emptyAnswered") : $t("review.overview.emptyOpen")}</p>
    {:else}
      <div class="flex flex-col gap-2">
        {#each shown as row (row.studentKey)}
          <ReviewOverviewRowCard {examId} {row} {namesShown} />
        {/each}
      </div>
    {/if}
  </div>
{/if}
