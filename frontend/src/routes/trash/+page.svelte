<script lang="ts">
  import { onMount } from "svelte";
  import { faRotateLeft, faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, PageShell, Spinner } from "#lib/components/ui";
  import { t, tOptional } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { awaitSessionReady } from "#lib/stores/session";
  import type { RestoreResult } from "#lib/trash/api";
  import {
    canRestore,
    loadTrash,
    purgeGroup,
    restoreGroup,
    type TrashGroupView,
    type TrashItemView,
    type TrashView,
  } from "#lib/trash/trashService";

  /** Everything the teacher deleted in the last days, grouped by action (issue #125). */
  let view: TrashView | null = $state.raw(null);
  let loadError = $state("");
  let pending: { group: TrashGroupView; action: "restore" | "purge" } | null = $state.raw(null);
  let busy = $state(false);
  let actionError = $state("");
  let report: RestoreResult | null = $state.raw(null);

  const DAY_MS = 86_400_000;

  async function refresh() {
    loadError = "";
    try {
      view = await loadTrash();
    } catch (err: any) {
      loadError = err?.message || String(err);
    }
  }

  onMount(async () => {
    await awaitSessionReady();
    await refresh();
  });

  function daysLeft(group: TrashGroupView): number {
    return Math.max(0, Math.ceil((Date.parse(group.purgeAfter) - Date.now()) / DAY_MS));
  }

  function itemTitle(item: TrashItemView): string {
    const params = {
      exam: item.examTitle ?? $t("trash.unknownExam"),
      exercise: item.exerciseName ?? $t("trash.unknownExercise"),
      file: item.filename ?? "",
      student: item.student ?? $t("trash.unknownStudent"),
    };
    return $tOptional(`trash.kind.${item.kind}`, params) ?? $t("trash.kind.other");
  }

  function countsText(item: TrashItemView): string {
    return Object.entries(item.counts)
      .map(([table, n]) => $tOptional(`trash.table.${table}`, { count: n }))
      .filter(Boolean)
      .join(", ");
  }

  async function confirmPending() {
    if (!pending) return;
    busy = true;
    actionError = "";
    try {
      if (pending.action === "restore") {
        report = await restoreGroup(pending.group);
      } else {
        await purgeGroup(pending.group);
        report = null;
      }
      pending = null;
      await refresh();
    } catch (err: any) {
      actionError = err?.message || String(err);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{$t("trash.title")} — Examance</title>
</svelte:head>

<PageShell width="medium">
  <PageHeader
    level="h1"
    title={$t("trash.title")}
    subtitle={$t("trash.subtitle", { days: view?.graceDays ?? 7 })}
    helpTopic="trash"
  />

  {#if report}
    <Alert
      severity={report.skipped.some((s) => !["detached", "older_version"].includes(s.reason)) ? "warning" : "success"}
      title={$t("trash.restoredTitle")}
      onDismiss={() => (report = null)}
      class="mb-4"
    >
      {#if report.skipped.length === 0}
        <p class="m-0">{$t("trash.restoredAll")}</p>
      {:else}
        <p class="mt-0 mb-1">{$t("trash.restoredPartly")}</p>
        <ul class="m-0 pl-5">
          {#each report.skipped as skip, i (i)}
            <li>
              {$tOptional(`trash.table.${skip.table}`, { count: 1 }) ?? skip.table}:
              {$tOptional(`trash.reason.${skip.reason}`) ?? skip.reason}
            </li>
          {/each}
        </ul>
      {/if}
    </Alert>
  {/if}

  {#if loadError}
    <Alert severity="danger" title={$t("trash.loadFailed")} class="mb-4">
      <p class="m-0">{loadError}</p>
      {#snippet actions()}
        <Button size="sm" variant="outlined" onClick={refresh}>{$t("trash.retry")}</Button>
      {/snippet}
    </Alert>
  {:else if view === null}
    <div class="flex justify-center py-8"><Spinner /></div>
  {:else if view.groups.length === 0}
    <EmptyState icon={faTrashCan} title={$t("trash.emptyTitle")} description={$t("trash.emptyBody", { days: view.graceDays })} />
  {:else}
    <div class="flex flex-col gap-3">
      {#each view.groups as group (group.groupId)}
        <Card>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 flex-1">
              <ul class="m-0 list-none p-0">
                {#each group.items as item (item.id)}
                  <li class="mb-1 min-w-0">
                    <span class="font-medium text-content break-words">{itemTitle(item)}</span>
                    {#if item.local}
                      <Badge size="xs" severity="secondary" class="ml-1">{$t("trash.inBrowser")}</Badge>
                    {/if}
                    {#if countsText(item)}
                      <span class="block text-xs text-muted">{countsText(item)}</span>
                    {/if}
                  </li>
                {/each}
              </ul>
              <p class="mt-1 mb-0 text-xs text-muted">
                {$t("trash.deletedOn", { date: $fmt.dateTime(group.deletedAt) })}
                · {$t("trash.daysLeft", { count: daysLeft(group) })}
              </p>
              {#if !canRestore(group)}
                <p class="mt-1 mb-0 text-xs text-warning-fg">{$t("trash.browserOnlyHint")}</p>
              {/if}
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                icon={faRotateLeft}
                disabled={!canRestore(group)}
                onClick={() => {
                  actionError = "";
                  pending = { group, action: "restore" };
                }}
              >
                {$t("trash.restore")}
              </Button>
              <Button
                size="sm"
                variant="outlined"
                severity="danger"
                icon={faTrashCan}
                onClick={() => {
                  actionError = "";
                  pending = { group, action: "purge" };
                }}
              >
                {$t("trash.purge")}
              </Button>
            </div>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</PageShell>

<ConfirmDialog
  open={pending !== null}
  title={pending?.action === "purge" ? $t("trash.purgeTitle") : $t("trash.restoreTitle")}
  message={pending?.action === "purge" ? $t("trash.purgeBody") : $t("trash.restoreBody")}
  confirmText={pending?.action === "purge" ? $t("trash.purge") : $t("trash.restore")}
  cancelText={$t("common.cancel")}
  severity={pending?.action === "purge" ? "danger" : "primary"}
  {busy}
  error={actionError}
  onConfirm={confirmPending}
  onCancel={() => (pending = null)}
/>
