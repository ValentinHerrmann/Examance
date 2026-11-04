<script lang="ts">
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { examChecksState } from "#lib/stores/shell";
  import { saveExamChecks } from "#lib/exam/examChecksService";
  import { PRINT_CHECKS, PRINT_REQUIRED, printCheckChanged, printCheckValid, printStamps, withPrintCheck, type PrintCheckId } from "#lib/exam/examChecks";
  import { Alert, Badge, Card, Checkbox } from "#lib/components/ui";

  /** What the teacher has printed (issue #212): ticked by hand only, never by compiling; a box un-ticks only when what it was ticked for changes. */
  interface Props {
    examId: string;
  }

  let { examId }: Props = $props();

  let cs = $derived($examChecksState && $examChecksState.examId === examId ? $examChecksState : null);
  let stamps = $derived(cs?.stamps ? printStamps(cs.stamps.content, cs.stamps.students) : null);
  let error = $state("");
  let busy = $state(false);

  async function toggle(id: PrintCheckId, on: boolean) {
    if (!cs || !stamps || busy) return;
    busy = true;
    error = "";
    try {
      await saveExamChecks(examId, withPrintCheck(cs.checks, id, on ? stamps[id] : null));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Card title={$t("exam.print.checklist.title")}>
  <p class="mt-0 mb-4 text-sm text-muted">{$t("exam.print.checklist.intro")}</p>
  {#if !cs || !stamps}
    <p class="m-0 text-sm text-muted">{$t("exam.print.checklist.unavailable")}</p>
  {:else}
    <ul class="m-0 flex list-none flex-col gap-3 p-0">
      {#each PRINT_CHECKS as id (id)}
        {@const check = cs.checks.print?.[id]}
        <li class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Checkbox
              label={$t(`exam.print.checklist.${id}`)}
              checked={printCheckValid(cs.checks, id, stamps)}
              disabled={busy}
              onChange={(on) => toggle(id, on)}
            />
            {#if !PRINT_REQUIRED.includes(id)}<Badge size="xs" severity="secondary">{$t("exam.print.checklist.optional")}</Badge>{/if}
            {#if check && printCheckValid(cs.checks, id, stamps)}
              <span class="text-xs text-muted">{$t("exam.print.checklist.tickedAt", { date: $fmt.date(check.at) })}</span>
            {/if}
          </div>
          <p class="m-0 ps-8 text-xs text-muted">{$t(`exam.print.checklist.${id}Hint`)}</p>
          {#if printCheckChanged(cs.checks, id, stamps)}
            <p class="m-0 ps-8 text-xs text-warning-fg" role="status">{$t(`exam.print.checklist.${id}Changed`)}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if error}<Alert severity="danger" class="mt-4">{error}</Alert>{/if}
</Card>
