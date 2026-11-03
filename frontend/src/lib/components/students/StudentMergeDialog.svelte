<script lang="ts">
  /** Merges two rows of one student (issue #209): the row with the scanned exam stays (its QR code and key are on the paper), the other's name, IDs and address fill in, conflicting values are picked here. The dropped row goes to the trash. */
  import { faCodeMerge } from "@fortawesome/free-solid-svg-icons";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert, Button, Modal, Radio, TableScroller } from "#lib/components/ui";
  import type { StudentRecord } from "#lib/db/schema";
  import { applyMerge, EDITABLE_FIELDS, mergeStudents, type EditableField } from "#lib/students/classList";
  import { sessionStore } from "#lib/stores/session";
  import { formatStudentName } from "#lib/utils/studentQr";

  interface Props {
    examId: string;
    pair: readonly [StudentRecord, StudentRecord];
    hasSubmission: (student: StudentRecord) => boolean;
    onDone: () => void;
    onClose: () => void;
  }

  let { examId, pair, hasSubmission, onDone, onClose }: Props = $props();

  let plan = $derived(mergeStudents(pair[0], pair[1], hasSubmission));
  // Per conflicting field: take the dropped row's value instead of the kept one.
  let takeOther = $state<Partial<Record<EditableField, boolean>>>({});
  let busy = $state(false);
  let error = $state("");

  const LABEL: Record<EditableField, Parameters<typeof $t>[0]> = {
    studentName: "lms.students.colName",
    mebisId: "lms.students.colMebisId",
    artemisId: "lms.students.colArtemisId",
    email: "lms.students.colEmail",
  };

  function result(): StudentRecord | null {
    if ("refused" in plan) return null;
    const merged = { ...plan.merged };
    for (const c of plan.conflicts) if (takeOther[c.field]) merged[c.field] = c.otherValue;
    return merged;
  }

  async function merge() {
    if ("refused" in plan) return;
    const merged = result();
    if (!merged) return;
    busy = true;
    error = "";
    try {
      await applyMerge(examId, { merged, drop: plan.drop }, get(sessionStore).sessionKey);
      onDone();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  const label = (st: StudentRecord) => formatStudentName(st.studentName) || st.fallbackCode || "?";
</script>

<Modal open={true} size="medium" title={$t("lms.students.merge.title")} onClose={busy ? undefined : onClose} {error}>
  {#if "refused" in plan}
    <Alert severity="warning">{$t(plan.refused)}</Alert>
  {:else}
    {@const merged = result()}
    <div class="flex flex-col gap-4 text-sm">
      <p class="m-0">{$t("lms.students.merge.intro", { keep: label(plan.keep), drop: label(plan.drop) })}</p>
      {#if hasSubmission(plan.keep)}<p class="m-0 text-muted">{$t("lms.students.merge.keepsScan")}</p>{/if}
      <TableScroller>
        <table class="data-table data-table-compact w-full">
          <thead>
            <tr>
              <th></th>
              <th>{$t("lms.students.merge.kept")}</th>
              <th>{$t("lms.students.merge.dropped")}</th>
              <th>{$t("lms.students.merge.result")}</th>
            </tr>
          </thead>
          <tbody>
            {#each EDITABLE_FIELDS as field (field)}
              {@const conflict = plan.conflicts.find((c) => c.field === field)}
              <tr>
                <th scope="row" class="font-normal text-muted">{$t(LABEL[field])}</th>
                <td class="break-all">{plan.keep[field] ?? ""}</td>
                <td class="break-all">{plan.drop[field] ?? ""}</td>
                <td class="break-all">
                  {#if conflict}
                    <div class="flex flex-col gap-1">
                      <Radio group={takeOther[field] ? "other" : "keep"} value="keep" name={`merge-${field}`} onchange={() => (takeOther = { ...takeOther, [field]: false })} label={conflict.keepValue} />
                      <Radio group={takeOther[field] ? "other" : "keep"} value="other" name={`merge-${field}`} onchange={() => (takeOther = { ...takeOther, [field]: true })} label={conflict.otherValue} />
                    </div>
                  {:else}
                    <strong>{merged?.[field] ?? ""}</strong>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </TableScroller>
      <p class="m-0 text-muted">{$t("lms.students.merge.trashNote")}</p>
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" disabled={busy} onClick={onClose}>{$t("common.cancel")}</Button>
    {#if !("refused" in plan)}
      <Button icon={faCodeMerge} loading={busy} disabled={busy} onClick={merge}>{$t("lms.students.merge.action")}</Button>
    {/if}
  {/snippet}
</Modal>
