<script lang="ts">
  import { t } from "#lib/i18n";
  import { examChecksState } from "#lib/stores/shell";
  import { saveExamChecks } from "#lib/exam/examChecksService";
  import { withMcSureCheck } from "#lib/exam/examChecks";
  import type { McCheckSummary } from "#lib/grading/mcVerification";
  import { Alert, Card, Checkbox } from "#lib/components/ui";

  /** The MC step's progress (issue #212): open failed/unsure items, sure ones looked at, and the teacher's own "sure detections checked" tick, which holds until the sure set changes. */
  interface Props {
    examId: string;
    summary: McCheckSummary;
    failedOpen: number;
    unsureOpen: number;
  }

  let { examId, summary, failedOpen, unsureOpen }: Props = $props();

  let checks = $derived($examChecksState && $examChecksState.examId === examId ? $examChecksState.checks : null);
  let manual = $derived(checks?.mc?.sure?.stamp === summary.sureStamp);
  let busy = $state(false);
  let error = $state("");

  async function toggle(on: boolean) {
    if (!checks || busy) return;
    busy = true;
    error = "";
    try {
      await saveExamChecks(examId, withMcSureCheck(checks, on ? summary.sureStamp : null));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Card class="mb-4" title={$t("scanning.verify.check.title")}>
  <ul class="m-0 mb-3 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-sm">
    <li>{$t("scanning.verify.check.failedOpen", { count: failedOpen })}</li>
    <li>{$t("scanning.verify.check.unsureOpen", { count: unsureOpen })}</li>
    <li>{$t("scanning.verify.check.sureLooked", { count: summary.sureReviewed, total: summary.sureTotal })}</li>
  </ul>
  {#if summary.sureTotal > 0}
    <Checkbox label={$t("scanning.verify.check.sureDone")} checked={manual} disabled={!checks || busy} onChange={toggle} />
    <p class="mt-1 mb-0 ps-8 text-xs text-muted">{$t("scanning.verify.check.sureHint")}</p>
  {/if}
  {#if error}<Alert severity="danger" class="mt-3">{error}</Alert>{/if}
</Card>
