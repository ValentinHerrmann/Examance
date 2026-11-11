<script lang="ts">
  import { untrack } from "svelte";
  import { Badge, Button, EmptyState, Field, Panel, SelectionToolbar, TableScroller, Textarea, TextInput } from "#lib/components/ui";
  import { Selection } from "#lib/utils/selection.svelte";
  import { createStudentWithSubmission } from "#lib/grading/scoreService";
  import { parseRosterLines } from "#lib/utils/rosterLines";
  import { buildSubmissionMap } from "#lib/utils/studentLookup";
  import { artemisIdOf, formatStudentName, mebisIdOf } from "#lib/utils/studentQr";
  import { duplicateCandidates } from "#lib/students/classList";
  import { faCodeMerge, faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
  import Checkbox from "#lib/components/ui/Checkbox.svelte";
  import StudentEditDialog from "#lib/components/students/StudentEditDialog.svelte";
  import StudentDeleteDialog from "#lib/components/students/StudentDeleteDialog.svelte";
  import StudentMergeDialog from "#lib/components/students/StudentMergeDialog.svelte";
  import type { StudentRecord, SubmissionRecord } from "#lib/db/schema";
  import { t } from "#lib/i18n";

  interface Props {
    examId: string;
    students?: StudentRecord[];
    submissions?: SubmissionRecord[];
    onRosterChanged?: () => void;
    /** The Students page's class list: no manual-grading add panel (the import does that), the Mebis/Artemis ID column, and unscanned students shown as such. */
    listMode?: boolean;
  }

  let { examId, students = [], submissions = [], onRosterChanged = () => {}, listMode = false }: Props = $props();

  let newName = $state("");
  let newStudentNumber = $state("");
  let newFallbackCode = $state("");
  let showBulk = $state(false);
  let bulkText = $state("");


  let submissionMap = $state.raw(new Map<string, SubmissionRecord>());
  // Only the newest build may write, so a slower stale build cannot overwrite a newer map.
  let submissionMapSeq = 0;

  async function handleAddSingle() {
    if (!newName.trim()) return;
    await createStudentWithSubmission(examId, {
      studentName: newName.trim(),
      studentNumber: newStudentNumber.trim() || undefined,
      fallbackCode: newFallbackCode.trim() || undefined,
    });

    newName = "";
    newStudentNumber = "";
    newFallbackCode = "";
    onRosterChanged();
  }

  async function handleAddBulk() {
    if (!bulkText.trim()) return;
    for (const parts of parseRosterLines(bulkText)) {
      const studentName = parts[0];
      if (!studentName) continue;
      await createStudentWithSubmission(examId, {
        studentName,
        studentNumber: parts[1] || undefined,
        fallbackCode: undefined,
      });
    }

    bulkText = "";
    showBulk = false;
    onRosterChanged();
  }


  // Deleting, bulk edits and merges each open a dialog that says what they affect (issue #209).
  let deleting = $state.raw<StudentRecord[] | null>(null);
  let editing = $state.raw<StudentRecord[] | null>(null);
  let merging = $state.raw<[StudentRecord, StudentRecord] | null>(null);
  const selection = new Selection();

  const submissionOf = (st: StudentRecord) => submissionMap.get(st.pseudonymHmac);
  const hasSubmission = (st: StudentRecord) => submissionMap.has(st.pseudonymHmac);
  let chosen = $derived(students.filter((st) => selection.has(st.pseudonymHmac)));
  let duplicates = $derived(listMode ? duplicateCandidates(students, hasSubmission) : []);
  const duplicateOf = (st: StudentRecord) => duplicates.find((pair) => pair.includes(st));

  function finished() {
    deleting = editing = merging = null;
    selection.clear();
    onRosterChanged();
  }

  const bulkPlaceholder = "Musterfrau, Karin\t12345\nMustermann, Peter\t67890\n ...";

  $effect.pre(() => {
    const subs = submissions;
    const sts = students;
    const seq = ++submissionMapSeq;
    untrack(() =>
      buildSubmissionMap(subs, sts).then((m) => {
        if (seq === submissionMapSeq) submissionMap = m;
      }),
    );
  });
</script>

<div class="flex min-w-0 flex-col gap-6">
  {#if !listMode}
  <Panel title={$t("grading.manual.roster.addTitle")}>
    <form onsubmit={(e) => { e.preventDefault(); handleAddSingle(); }} class="flex flex-wrap items-end gap-4">
      <Field label={$t("grading.manual.roster.nameLabel")} class="min-w-[min(11rem,100%)] flex-1">
        {#snippet children({ id })}
          <TextInput
            {id}
            bind:value={newName}
            placeholder={$t("grading.manual.roster.namePlaceholder")}
            required
          />
        {/snippet}
      </Field>
      <Field label={$t("grading.manual.roster.numberLabel")} class="min-w-[min(11rem,100%)] flex-1">
        {#snippet children({ id })}
          <TextInput {id} bind:value={newStudentNumber} placeholder="123456" />
        {/snippet}
      </Field>
      <Field label={$t("grading.manual.roster.fallbackLabel")} class="min-w-[min(11rem,100%)] flex-1">
        {#snippet children({ id })}
          <TextInput {id} bind:value={newFallbackCode} placeholder="ABC1" />
        {/snippet}
      </Field>
      <Button type="submit" icon={faPlus}>{$t("grading.manual.roster.addButton")}</Button>
    </form>

    <Button
      variant="text"
      size="sm"
      class="mt-3"
      onClick={() => (showBulk = !showBulk)}
    >
      {showBulk ? $t("grading.manual.roster.hideBulk") : $t("grading.manual.roster.showBulk")}
    </Button>

    {#if showBulk}
      <div class="mt-3 flex flex-col gap-2">
        <p class="m-0 text-sm text-muted">
          {$t("grading.manual.roster.bulkHintPrefix")} <code>Name [Tab or Comma] StudentNumber</code>{$t("grading.manual.roster.bulkHintSuffix")}
        </p>
        <Textarea
          bind:value={bulkText}
          class="h-32 resize-y font-mono"
          placeholder={bulkPlaceholder}
        />
        <div class="flex justify-end gap-2">
          <Button variant="outlined" severity="secondary" onClick={() => (showBulk = false)}>{$t("common.cancel")}</Button>
          <Button onClick={handleAddBulk}>{$t("grading.manual.roster.bulkImport")}</Button>
        </div>
      </div>
    {/if}
  </Panel>
  {/if}

  {#if duplicates.length}
    <Panel title={$t("lms.students.duplicates.title", { count: duplicates.length })}>
      <p class="m-0 mb-3 text-sm text-muted">{$t("lms.students.duplicates.intro")}</p>
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        {#each duplicates as pair (pair[0].pseudonymHmac + pair[1].pseudonymHmac)}
          <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <strong>{formatStudentName(pair[0].studentName)}</strong>
              <span class="text-muted">({pair.map((st) => (hasSubmission(st) ? $t("grading.manual.roster.scanned") : st.fromList ? $t("lms.students.fromList") : $t("lms.students.sticker"))).join(" + ")})</span>
            </span>
            <Button size="sm" variant="outlined" icon={faCodeMerge} onClick={() => (merging = pair)}>{$t("lms.students.merge.action")}</Button>
          </li>
        {/each}
      </ul>
    </Panel>
  {/if}

  {#if students.length === 0}
    <EmptyState title={$t("grading.manual.roster.emptyState")} />
  {:else}
    <SelectionToolbar
      count={chosen.length}
      hint={$t("lms.students.toolbarHint")}
      countText={$t("lms.students.selection", { count: chosen.length })}
      onClear={() => selection.clear()}
      reason={chosen.length !== 2 ? $t("lms.students.merge.needTwo") : ""}
    >
      {#snippet actions()}
        <Button size="sm" variant="outlined" icon={faPen} disabled={!chosen.length} onClick={() => (editing = chosen)}>{$t("lms.students.edit.action")}</Button>
        <Button size="sm" variant="outlined" icon={faCodeMerge} disabled={chosen.length !== 2} onClick={() => (merging = [chosen[0], chosen[1]])}>{$t("lms.students.merge.action")}</Button>
        <Button size="sm" variant="outlined" severity="danger" icon={faTrash} disabled={!chosen.length} onClick={() => (deleting = chosen)}>{$t("common.delete")}</Button>
      {/snippet}
    </SelectionToolbar>
    <TableScroller>
      <table class="data-table data-table-compact data-table-sticky data-table-hover">
        <thead>
          <tr>
            <th class="w-8">
              <Checkbox
                checked={chosen.length > 0 && chosen.length === students.length}
                onChange={(on) => (on ? selection.set(students.map((st) => st.pseudonymHmac)) : selection.clear())}
                aria-label={$t("lms.students.selectAll")}
              />
            </th>
            <th>{$t("grading.manual.roster.colNum")}</th>
            <th>{$t("grading.manual.roster.colName")}</th>
            <th class="w-px whitespace-normal">{$t("grading.manual.roster.colNumber")}</th>
            {#if listMode}<th class="w-px whitespace-normal">{$t("lms.students.colMebisId")}</th><th class="w-px whitespace-normal">{$t("lms.students.colArtemisId")}</th>{/if}
            <th>{$t("grading.manual.roster.colEmail")}</th>
            <th>{$t("grading.manual.roster.colPseudonym")}</th>
            <th>{$t("grading.manual.roster.colType")}</th>
            <th class="w-px"><span class="sr-only">{$t("grading.manual.roster.colActions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each students as st, i (st.pseudonymHmac)}
            {@const sub = submissionMap.get(st.pseudonymHmac)}
            {@const isScanned = !!(sub?.scanCt || sub?.scanIv || sub?.hasScan)}
            <tr>
              <td><Checkbox checked={selection.has(st.pseudonymHmac)} onChange={(on) => selection.toggle(st.pseudonymHmac, on)} aria-label={st.studentName || st.fallbackCode || ""} /></td>
              <td>{i + 1}</td>
              <td>
                <strong class="whitespace-nowrap">{st.studentName || $t("grading.manual.roster.unnamed")}</strong>
              </td>
              <td class="whitespace-nowrap tabular-nums">{st.studentNumber || "-"}</td>
              {#if listMode}<td class="tabular-nums">{mebisIdOf(st) ?? "-"}</td><td class="tabular-nums">{artemisIdOf(st) ?? "-"}</td>{/if}
              <td class="whitespace-nowrap">{st.email || "-"}</td>
              <td>
                <span class="block max-w-[16ch] truncate font-mono text-sm text-muted" title={st.fallbackCode || st.pseudonymHmac.slice(0, 8)}>
                  {st.fallbackCode || st.pseudonymHmac.slice(0, 8)}
                </span>
              </td>
              <td>
                {#if isScanned}
                  <Badge severity="info" size="xs">{$t("grading.manual.roster.scanned")}</Badge>
                {:else if listMode && !sub}
                  <Badge severity="secondary" size="xs">{$t("lms.students.notScanned")}</Badge>
                {:else}
                  <Badge severity="success" size="xs">{$t("grading.manual.roster.manual")}</Badge>
                {/if}
              </td>
              <td class="whitespace-nowrap">
                <div class="flex gap-0.5">
                  <!-- The same dialog as the bulk edit, so one row gets the same fields and warnings. -->
                  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faPen} ariaLabel={$t("common.edit")} title={$t("common.edit")} onClick={() => (editing = [st])} />
                  <Button size="sm" variant="text" severity="danger" iconOnly icon={faTrash} ariaLabel={$t("common.delete")} title={$t("common.delete")} onClick={() => (deleting = [st])} />
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>
  {/if}
</div>

{#if deleting}
  {@const single = deleting.length === 1 ? duplicateOf(deleting[0]) : undefined}
  <StudentDeleteDialog
    {examId}
    students={deleting}
    {submissionOf}
    onMergeInstead={single ? () => ((merging = single), (deleting = null)) : undefined}
    onDone={finished}
    onCancel={() => (deleting = null)}
  />
{/if}
{#if editing}
  <StudentEditDialog students={editing} all={students} {hasSubmission} onSaved={finished} onClose={() => (editing = null)} />
{/if}
{#if merging}
  <StudentMergeDialog {examId} pair={merging} {hasSubmission} onDone={finished} onClose={() => (merging = null)} />
{/if}
