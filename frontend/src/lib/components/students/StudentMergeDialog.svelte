<script lang="ts">
  /** Merges two entries of one student (issue #209). A merge means something already went wrong, so nothing is decided silently: both entries side by side, a choice for every field both fill, and a preview of the result with what it means for sharing; merging needs an explicit "checked". Entry A (the scanned one, else the sticker one) stays, B goes to the trash. */
  import { faCodeMerge } from "@fortawesome/free-solid-svg-icons";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal, Radio, TableScroller } from "#lib/components/ui";
  import type { StudentRecord } from "#lib/db/schema";
  import { applyMerge, EDITABLE_FIELDS, mergeStudents, type EditableField } from "#lib/students/classList";
  import { sessionStore } from "#lib/stores/session";
  import { artemisIdOf, formatStudentName, mebisIdOf, stickerRawOf } from "#lib/utils/studentQr";

  interface Props {
    examId: string;
    pair: readonly [StudentRecord, StudentRecord];
    hasSubmission: (student: StudentRecord) => boolean;
    onDone: () => void;
    onClose: () => void;
  }

  let { examId, pair, hasSubmission, onDone, onClose }: Props = $props();

  let plan = $derived(mergeStudents(pair[0], pair[1], hasSubmission));
  // Per field both entries fill: take B's value instead of A's.
  let takeOther = $state<Partial<Record<EditableField, boolean>>>({});
  let checked = $state(false);
  let busy = $state(false);
  let error = $state("");

  const LABEL: Record<EditableField, Parameters<typeof $t>[0]> = {
    studentName: "lms.students.colName",
    studentNumber: "lms.students.colNumber",
    mebisId: "lms.students.colMebisId",
    artemisId: "lms.students.colArtemisId",
    email: "lms.students.colEmail",
  };

  let result = $derived.by((): StudentRecord | null => {
    if ("refused" in plan) return null;
    const merged = { ...plan.merged };
    for (const c of plan.choices) merged[c.field] = takeOther[c.field] ? c.otherValue : c.keepValue;
    return merged;
  });

  function status(st: StudentRecord): string {
    const parts = [hasSubmission(st) ? $t("lms.students.merge.status.scanned") : $t("lms.students.merge.status.notScanned")];
    parts.push(st.fromList ? $t("lms.students.merge.status.fromList") : $t("lms.students.merge.status.sticker"));
    const raw = stickerRawOf(st);
    if (raw) parts.push($t("lms.students.merge.status.qr", { raw }));
    return parts.join(" · ");
  }

  const reach = (id: string | null | undefined) => (id ? $t("lms.students.merge.reachable", { id }) : $t("lms.students.merge.unreachable"));

  async function merge() {
    if ("refused" in plan || !result) return;
    busy = true;
    error = "";
    try {
      await applyMerge(examId, { merged: result, drop: plan.drop }, get(sessionStore).sessionKey);
      onDone();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal open={true} size="large" title={$t("lms.students.merge.title")} onClose={busy ? undefined : onClose} {error}>
  {#if "refused" in plan}
    <Alert severity="warning">{$t(plan.refused)}</Alert>
  {:else}
    <div class="flex min-w-0 flex-col gap-4 text-sm">
      <p class="m-0">
        {hasSubmission(plan.keep) ? $t("lms.students.merge.why.scan") : plan.keep.fromList ? $t("lms.students.merge.why.list") : $t("lms.students.merge.why.sticker")}
      </p>
      <ul class="m-0 list-none p-0 text-muted">
        <li><strong>A</strong> · {formatStudentName(plan.keep.studentName) || "?"} · {status(plan.keep)}</li>
        <li><strong>B</strong> · {formatStudentName(plan.drop.studentName) || "?"} · {status(plan.drop)}</li>
      </ul>

      <TableScroller>
        <table class="data-table data-table-compact w-full">
          <thead>
            <tr>
              <th></th>
              <th>{$t("lms.students.merge.entryA")}</th>
              <th>{$t("lms.students.merge.entryB")}</th>
              <th>{$t("lms.students.merge.result")}</th>
            </tr>
          </thead>
          <tbody>
            {#each EDITABLE_FIELDS as field (field)}
              {@const choice = plan.choices.find((c) => c.field === field)}
              <tr>
                <th scope="row" class="font-normal text-muted">{$t(LABEL[field])}</th>
                <td class="break-all">{plan.keep[field] || $t("lms.students.merge.empty")}</td>
                <td class="break-all">{plan.drop[field] || $t("lms.students.merge.empty")}</td>
                <td class="break-all">
                  {#if choice}
                    <div class="flex flex-col gap-1">
                      <Radio group={takeOther[field] ? "b" : "a"} value="a" name={`merge-${field}`} disabled={busy} onchange={() => (takeOther = { ...takeOther, [field]: false })} label={`A: ${choice.keepValue}`} />
                      <Radio group={takeOther[field] ? "b" : "a"} value="b" name={`merge-${field}`} disabled={busy} onchange={() => (takeOther = { ...takeOther, [field]: true })} label={`B: ${choice.otherValue}`} />
                      {#if choice.equivalent}<span class="text-muted">{$t("lms.students.merge.equivalent")}</span>{/if}
                    </div>
                  {:else if result?.[field]}
                    <strong>{result[field]}</strong>
                    {#if plan.filled.includes(field)}<span class="text-muted"> ({$t("lms.students.merge.fromB")})</span>{/if}
                  {:else}
                    {$t("lms.students.merge.empty")}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </TableScroller>

      {#if result}
        <div class="flex flex-col gap-1 rounded-md border border-line p-3">
          <p class="m-0 font-semibold">{$t("lms.students.merge.previewTitle")}: {formatStudentName(result.studentName) || "?"}</p>
          <ul class="m-0 list-disc pl-5">
            <li>{$t("lms.students.merge.reachMebis", { state: reach(mebisIdOf(result)) })}</li>
            <li>{$t("lms.students.merge.reachArtemis", { state: reach(artemisIdOf(result)) })}</li>
            <li>{$t("lms.students.merge.reachEmail", { state: result.email || $t("lms.students.merge.unreachable") })}</li>
            <li>{hasSubmission(plan.keep) ? $t("lms.students.merge.scanKept") : $t("lms.students.merge.noScan")}</li>
          </ul>
        </div>
      {/if}

      <p class="m-0 text-muted">{$t("lms.students.merge.trashNote")}</p>
      <Checkbox bind:checked label={$t("lms.students.merge.checked")} disabled={busy} />
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" disabled={busy} onClick={onClose}>{$t("common.cancel")}</Button>
    {#if !("refused" in plan)}
      <Button icon={faCodeMerge} loading={busy} disabled={busy || !checked} onClick={merge}>{$t("lms.students.merge.action")}</Button>
    {/if}
  {/snippet}
</Modal>
