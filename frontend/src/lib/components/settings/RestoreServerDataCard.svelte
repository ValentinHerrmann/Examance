<script lang="ts">
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Alert, Button, Card, ConfirmDialog } from "#lib/components/ui";
  import { examRepository } from "#lib/repositories/examRepository";
  import { sessionStore } from "#lib/stores/session";
  import { restoreServerDataReport, type RestoreReport } from "#lib/services/serverDataRestore";

  /** Restores server results still inside the grace period and names the exams whose older ones retention already erased (issue #181). The parent shows it only when the account may write results to the server. */
  interface Props {
    /** Results live in this browser: the restored copy stays on the server until the account switches. */
    hybrid: boolean;
  }

  let { hybrid }: Props = $props();

  let confirming = $state(false);
  let busy = $state(false);
  let error = $state("");
  let report: RestoreReport | null = $state.raw(null);

  async function restore() {
    busy = true;
    error = "";
    try {
      report = await restoreServerDataReport(() => examRepository.getAll(get(sessionStore).sessionKey));
      confirming = false;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div id="restore-server-data" class="scroll-mt-16 lg:scroll-mt-4">
  <Card title={$t("settings.restoreServerData.heading")}>
    <p class="mt-0 mb-2 text-sm text-muted">{$t("settings.restoreServerData.description")}</p>
    <p class="mt-0 mb-3 text-xs text-muted">{$t("settings.restoreServerData.notRestored")}</p>
    {#if hybrid}
      <p class="mt-0 mb-3 text-xs text-warning-fg">{$t("settings.restoreServerData.hybridNote")}</p>
    {/if}
    <Button
      variant="outlined"
      severity="secondary"
      onClick={() => {
        error = "";
        confirming = true;
      }}
    >
      {$t("settings.restoreServerData.button")}
    </Button>

    {#if report}
      <Alert severity="success" class="mt-3" onDismiss={() => (report = null)}>
        <p class="m-0">
          {$t("settings.restoreServerData.done", { students: report.students, submissions: report.submissions })}
        </p>
        {#if report.purged.length > 0}
          <p class="mt-2 mb-1">{$t("settings.restoreServerData.purgedHeading", { days: report.graceDays })}</p>
          <ul class="m-0 list-disc pl-5">
            {#each report.purged as line, i (i)}
              <li>
                {$t("settings.restoreServerData.purgedItem", {
                  title: line.title ?? $t("exam.page.untitledExam"),
                  date: $fmt.date(line.purgedAt),
                })}
              </li>
            {/each}
          </ul>
        {/if}
      </Alert>
    {/if}
  </Card>
</div>

<ConfirmDialog
  open={confirming}
  title={$t("settings.restoreServerData.confirmTitle")}
  message={$t("settings.restoreServerData.confirmMessage")}
  confirmText={$t("settings.restoreServerData.button")}
  cancelText={$t("common.cancel")}
  role="dialog"
  {busy}
  {error}
  onConfirm={restore}
  onCancel={() => (confirming = false)}
/>
