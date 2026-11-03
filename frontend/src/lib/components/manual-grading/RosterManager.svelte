<script lang="ts">
  import { newTrashGroup } from "#lib/trash/group";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import { untrack } from "svelte";
  import { faPlus } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, EmptyState, Field, Panel, TableScroller, Textarea, TextInput } from "#lib/components/ui";
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { createStudentWithSubmission } from "#lib/grading/scoreService";
  import { parseRosterLines } from "#lib/utils/rosterLines";
  import { buildSubmissionMap } from "#lib/utils/studentLookup";
  import { artemisIdOf, formatStudentName, mebisIdOf } from "#lib/utils/studentQr";
  import { duplicateCandidates } from "#lib/students/classList";
  import { faCodeMerge, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
  import Checkbox from "#lib/components/ui/Checkbox.svelte";
  import StudentBulkEdit from "#lib/components/students/StudentBulkEdit.svelte";
  import StudentDeleteDialog from "#lib/components/students/StudentDeleteDialog.svelte";
  import StudentMergeDialog from "#lib/components/students/StudentMergeDialog.svelte";
  import type { StudentRecord, SubmissionRecord } from "#lib/db/schema";
  import { t, translate } from "#lib/i18n";

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

  let editingPseudonym: string | null = $state(null);
  let editName = $state("");
  let editStudentNumber = $state("");
  let editEmail = $state("");

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

  function startEdit(st: StudentRecord) {
    editingPseudonym = st.pseudonymHmac;
    editName = st.studentName || "";
    editStudentNumber = st.studentNumber || "";
    editEmail = st.email || "";
  }

  async function saveEdit(st: StudentRecord) {
    if (!editName.trim()) return;
    const key = get(sessionStore).sessionKey;
    const updated: StudentRecord = {
      ...st,
      studentName: editName.trim(),
      studentNumber: editStudentNumber.trim() || undefined,
      email: editEmail.trim() || undefined,
    };
    await studentRepository.save(updated, key);
    editingPseudonym = null;
    onRosterChanged();
  }

  function cancelEdit() {
    editingPseudonym = null;
  }

  // Deleting, bulk edits and merges each open a dialog that says what they affect (issue #209).
  let deleting = $state.raw<StudentRecord[] | null>(null);
  let bulkEditing = $state.raw<StudentRecord[] | null>(null);
  let merging = $state.raw<[StudentRecord, StudentRecord] | null>(null);
  let selected = $state.raw(new Set<string>());

  const submissionOf = (st: StudentRecord) => submissionMap.get(st.pseudonymHmac);
  const hasSubmission = (st: StudentRecord) => submissionMap.has(st.pseudonymHmac);
  let chosen = $derived(students.filter((st) => selected.has(st.pseudonymHmac)));
  let duplicates = $derived(listMode ? duplicateCandidates(students, hasSubmission) : []);
  const duplicateOf = (st: StudentRecord) => duplicates.find((pair) => pair.includes(st));

  function toggle(st: StudentRecord, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(st.pseudonymHmac);
    else next.delete(st.pseudonymHmac);
    selected = next;
  }

  function finished() {
    deleting = bulkEditing = merging = null;
    selected = new Set();
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
    {#if chosen.length}
      <div class="flex flex-wrap items-center gap-2 rounded-md border border-line p-2 text-sm" role="toolbar" aria-label={$t("lms.students.selection", { count: chosen.length })}>
        <span class="mr-2">{$t("lms.students.selection", { count: chosen.length })}</span>
        <Button size="sm" variant="outlined" icon={faPen} onClick={() => (bulkEditing = chosen)}>{$t("lms.students.bulk.action")}</Button>
        <Button size="sm" variant="outlined" icon={faCodeMerge} disabled={chosen.length !== 2} title={$t("lms.students.merge.needTwo")} onClick={() => (merging = [chosen[0], chosen[1]])}>{$t("lms.students.merge.action")}</Button>
        <Button size="sm" variant="outlined" severity="danger" icon={faTrash} onClick={() => (deleting = chosen)}>{$t("common.delete")}</Button>
        <Button size="sm" variant="text" severity="secondary" onClick={() => (selected = new Set())}>{$t("sharing.share.selectNone")}</Button>
      </div>
    {/if}
    <TableScroller>
      <table class="data-table data-table-compact data-table-sticky data-table-hover">
        <thead>
          <tr>
            <th class="w-8">
              <Checkbox
                checked={chosen.length > 0 && chosen.length === students.length}
                onChange={(on) => (selected = on ? new Set(students.map((st) => st.pseudonymHmac)) : new Set())}
                aria-label={$t("lms.students.selectAll")}
              />
            </th>
            <th>{$t("grading.manual.roster.colNum")}</th>
            <th>{$t("grading.manual.roster.colName")}</th>
            <th>{$t("grading.manual.roster.colNumber")}</th>
            {#if listMode}<th>{$t("lms.students.colMebisId")}</th><th>{$t("lms.students.colArtemisId")}</th>{/if}
            <th>{$t("grading.manual.roster.colEmail")}</th>
            <th>{$t("grading.manual.roster.colPseudonym")}</th>
            <th>{$t("grading.manual.roster.colType")}</th>
            <th>{$t("grading.manual.roster.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each students as st, i (st.pseudonymHmac)}
            {@const sub = submissionMap.get(st.pseudonymHmac)}
            {@const isScanned = !!(sub?.scanCt || sub?.scanIv || sub?.hasScan)}
            <tr>
              <td><Checkbox checked={selected.has(st.pseudonymHmac)} onChange={(on) => toggle(st, on)} aria-label={st.studentName || st.fallbackCode || ""} /></td>
              <td>{i + 1}</td>
              <td>
                {#if editingPseudonym === st.pseudonymHmac}
                  <TextInput size="sm" bind:value={editName} />
                {:else}
                  <strong>{st.studentName || $t("grading.manual.roster.unnamed")}</strong>
                {/if}
              </td>
              <td>
                {#if editingPseudonym === st.pseudonymHmac}
                  <TextInput size="sm" bind:value={editStudentNumber} />
                {:else}
                  {st.studentNumber || "-"}
                {/if}
              </td>
              {#if listMode}<td class="tabular-nums">{mebisIdOf(st) ?? "-"}</td><td class="tabular-nums">{artemisIdOf(st) ?? "-"}</td>{/if}
              <td>
                {#if editingPseudonym === st.pseudonymHmac}
                  <TextInput size="sm" type="email" bind:value={editEmail} />
                {:else}
                  <span class="break-all">{st.email || "-"}</span>
                {/if}
              </td>
              <td>
                <span class="font-mono text-sm text-muted">
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
                <div class="flex gap-1.5">
                  {#if editingPseudonym === st.pseudonymHmac}
                    <Button size="sm" onClick={() => saveEdit(st)}>{$t("common.save")}</Button>
                    <Button size="sm" variant="outlined" severity="secondary" onClick={cancelEdit}>{$t("common.cancel")}</Button>
                  {:else}
                    <Button size="sm" variant="outlined" severity="secondary" onClick={() => startEdit(st)}>{$t("common.edit")}</Button>
                    <Button size="sm" variant="outlined" severity="danger" onClick={() => (deleting = [st])}>{$t("common.delete")}</Button>
                  {/if}
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
{#if bulkEditing}
  <StudentBulkEdit students={bulkEditing} all={students} {hasSubmission} onSaved={finished} onClose={() => (bulkEditing = null)} />
{/if}
{#if merging}
  <StudentMergeDialog {examId} pair={merging} {hasSubmission} onDone={finished} onClose={() => (merging = null)} />
{/if}
