<script lang="ts">
  import { get } from "svelte/store";
  import { t, translate } from "#lib/i18n";
  import type { ExamRecord } from "#lib/db/schema";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import { examRepository } from "#lib/repositories/examRepository";
  import { statisticsRepository } from "#lib/repositories/statisticsRepository";
  import { sessionStore } from "#lib/stores/session";
  import { newTrashGroup } from "#lib/trash/group";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import { recordValue } from "#lib/utils/recentValues";
  import { generatedExamTitle } from "#lib/utils/examLabel";
  import { addPackages, type BulkField, type BulkItem } from "#lib/bulk/bulkEdit";
  import { entriesError, type LatexPackageEntry } from "#lib/latex/packages";
  import { entryErrorText } from "#lib/latex/packageMessages";
  import { Alert } from "#lib/components/ui";
  import BulkEditDialog from "#lib/components/common/BulkEditDialog.svelte";
  import DeleteWithUsageModal from "#lib/components/common/DeleteWithUsageModal.svelte";
  import KeepStatisticsOption from "#lib/components/stats/KeepStatisticsOption.svelte";
  import ExamExportModal from "#lib/components/exam/ExamExportModal.svelte";
  import PackageEntriesEditor from "#lib/components/latex-packages/PackageEntriesEditor.svelte";

  /** The exam list's actions on one or several exams (issue #261): edit details, export, delete. Opened through `open()`; the single-exam menu uses the same delete and export. */
  interface Props {
    /** Submissions per exam, for the delete warning. */
    submissionCount: (examId: string) => number;
    /** Reloads the list after a change. */
    onChanged: () => Promise<void> | void;
  }

  let { submissionCount, onChanged }: Props = $props();

  type Kind = "edit" | "delete" | "export";
  let kind = $state<Kind | null>(null);
  let targets = $state.raw<ExamRecord[]>([]);
  let busy = $state(false);
  let error = $state("");
  let added = $state.raw<LatexPackageEntry[]>([]);
  let keepStatistics = $state(true);
  let statisticsRecordIds = $state<string[]>([]);

  export function open(next: Kind, exams: ExamRecord[]) {
    if (!exams.length) return;
    targets = exams;
    error = "";
    added = [];
    kind = next;
  }

  function close() {
    kind = null;
    targets = [];
  }

  const untitled = () => translate("dashboard.examList.untitledExam");
  const titleOf = (exam: ExamRecord) => exam.title || untitled();

  // Bulk-editable details: organising labels and the printed header, never per-exam content.
  const FIELD_KEYS = ["testart", "nr", "fach", "grade", "klasse", "course", "topic", "datum", "lehrernachname", "infoText"] as const;
  type FieldKey = (typeof FIELD_KEYS)[number];
  const STORAGE: Partial<Record<FieldKey, string>> = { testart: "exam.testart", fach: "exam.fach", grade: "exam.grade", klasse: "exam.klasse", topic: "exam.topic", lehrernachname: "exam.lehrernachname" };

  let fields = $derived<BulkField[]>(
    FIELD_KEYS.map((key) => ({
      key,
      label: key === "course" ? $t("dashboard.bulk.courseLabel") : $t(`exam.metadataEditor.${key}`),
      storageKey: STORAGE[key],
      maxlength: key === "nr" ? 10 : key === "topic" ? 200 : key === "infoText" ? undefined : 100,
      multiline: key === "infoText",
    })),
  );
  let items = $derived<BulkItem[]>(targets.map((exam) => ({ id: exam.id, title: titleOf(exam), values: Object.fromEntries(FIELD_KEYS.map((k) => [k, exam[k] ?? ""])) })));
  let addedError = $derived(added.length ? entriesError(added) : null);

  function packageResult(exam: ExamRecord) {
    return added.length && !addedError ? addPackages(exam.latexPackages, added) : null;
  }

  function packageLines(item: BulkItem): string[] {
    const exam = targets.find((e) => e.id === item.id);
    const res = exam && packageResult(exam);
    if (!res) return [];
    if (res.error) return [$t("dashboard.bulk.packagesSkipped", { reason: entryErrorText($t, res.error, "") })];
    return [$t("dashboard.bulk.packagesAdded", { names: added.map((e) => e.name).join(", ") })];
  }

  /** The exam with the patch applied; a generated title follows the new details, a custom one stays. */
  function edited(exam: ExamRecord, patch: Record<string, string>): ExamRecord | null {
    const next: ExamRecord = { ...exam };
    for (const key of FIELD_KEYS) if (key in patch) next[key] = patch[key];
    const titleWasGenerated = !exam.title?.trim() || exam.title === generatedExamTitle(exam, untitled());
    if (titleWasGenerated) next.title = generatedExamTitle(next, untitled());
    const res = packageResult(exam);
    if (res && !res.error) next.latexPackages = res.entries;
    const changed = FIELD_KEYS.some((k) => (next[k] ?? "") !== (exam[k] ?? "")) || next.latexPackages !== exam.latexPackages;
    return changed ? next : null;
  }

  async function applyEdit(patch: Record<string, string>) {
    if (addedError) {
      error = translate("dashboard.bulk.packagesInvalid");
      return;
    }
    busy = true;
    error = "";
    const failed: string[] = [];
    const key = get(sessionStore).sessionKey;
    for (const exam of targets) {
      const next = edited(exam, patch);
      if (!next) continue;
      try {
        await saveExamEncrypted(next, key); // NOSONAR: one PATCH at a time, so a failure is reported per exam
      } catch (err) {
        failed.push(`${titleOf(exam)} (${(err as Error)?.message ?? err})`);
      }
    }
    for (const [field, storageKey] of Object.entries(STORAGE)) if (patch[field]) recordValue(storageKey, patch[field]);
    busy = false;
    await onChanged();
    if (failed.length) error = translate("common.bulk.failedItems", { items: failed.join(", ") });
    else close();
  }

  let withSubmissions = $derived(targets.filter((exam) => submissionCount(exam.id) > 0));

  async function confirmDelete() {
    busy = true;
    error = "";
    const failed: string[] = [];
    try {
      // The records outlive the exams unless the teacher unticks it (issue #238).
      for (const id of statisticsRecordIds) await statisticsRepository.setKeep(id, keepStatistics);
      // One trash entry for the whole action (issue #125).
      const group = newTrashGroup();
      for (const exam of targets) {
        try {
          await examRepository.delete(exam.id, { group }); // NOSONAR: sequential, so a refused delete is reported per exam
        } catch (err) {
          failed.push(`${titleOf(exam)} (${(err as Error)?.message ?? err})`);
        }
      }
    } catch (err) {
      failed.push((err as Error)?.message ?? String(err));
    } finally {
      busy = false;
    }
    await onChanged();
    if (failed.length) error = translate("dashboard.bulk.deleteFailedSome", { items: failed.join(", ") });
    else close();
  }

  let single = $derived(targets.length === 1 ? targets[0] : null);
</script>

{#if kind === "edit"}
  <BulkEditDialog
    title={$t("dashboard.bulk.editTitle", { count: targets.length })}
    {fields}
    {items}
    applyLabel={(count) => $t("dashboard.bulk.apply", { count })}
    {busy}
    {error}
    onApply={applyEdit}
    onClose={close}
    extraChanges={packageLines}
  >
    {#snippet extra()}
      <section class="rounded-md p-1.5 {added.length ? 'border-2 border-accent bg-highlight' : 'border-2 border-transparent'}">
        <h3 class="m-0 mb-1 text-sm font-semibold text-content">{$t("dashboard.bulk.packagesTitle")}</h3>
        <p class="m-0 mb-2 text-sm text-muted">{$t("dashboard.bulk.packagesHint")}</p>
        <PackageEntriesEditor bind:entries={added} idPrefix="bulk-packages" emptyText={$t("dashboard.bulk.packagesEmpty")} />
        {#if addedError}<Alert severity="danger" class="mt-2">{$t("dashboard.bulk.packagesInvalid")}</Alert>{/if}
      </section>
    {/snippet}
  </BulkEditDialog>
{:else if kind === "export"}
  <ExamExportModal exams={targets.map((exam) => ({ id: exam.id, title: exam.title ?? "" }))} onClose={close} />
{/if}

<DeleteWithUsageModal
  open={kind === "delete"}
  title={single ? $t("dashboard.deleteModal.title", { title: titleOf(single) }) : $t("dashboard.bulk.deleteTitle", { count: targets.length })}
  usageTitle={$t("dashboard.deleteModal.warningTitle")}
  usageText={withSubmissions.length === 0
    ? ""
    : single
      ? $t("dashboard.deleteModal.usageInfo", { count: submissionCount(single.id) })
      : $t("dashboard.bulk.deleteUsage", { count: withSubmissions.length })}
  usageHint={$t("dashboard.deleteModal.usageWarning")}
  items={single ? [] : withSubmissions.map((exam) => ({ id: exam.id, title: titleOf(exam), meta: $t("dashboard.bulk.examMeta", { count: submissionCount(exam.id) }) }))}
  plainText={single ? $t("dashboard.deleteModal.confirmPlain") : $t("dashboard.bulk.deleteConfirm", { count: targets.length })}
  restoreHint={$t("common.trashHint", { days: TRASH_DAYS })}
  {busy}
  {error}
  onConfirm={confirmDelete}
  onClose={close}
>
  <KeepStatisticsOption examIds={kind === "delete" ? targets.map((exam) => exam.id) : []} bind:keep={keepStatistics} bind:recordIds={statisticsRecordIds} />
</DeleteWithUsageModal>
