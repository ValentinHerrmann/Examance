<script lang="ts">
  import { untrack } from "svelte";
  import { faPlus } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, EmptyState, Field, Panel, TableScroller, Textarea, TextInput } from "$lib/components/ui";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { studentRepository } from "$lib/repositories/studentRepository";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { saveSubmissionEncrypted } from "$lib/db/dbEncryption";
  import { buildSubmissionMap } from "$lib/utils/studentLookup";
  import type { StudentRecord, SubmissionRecord } from "$lib/db/schema";
  import { t, translate } from "$lib/i18n";

  interface Props {
    examId: string;
    students?: StudentRecord[];
    submissions?: SubmissionRecord[];
    onRosterChanged?: () => void;
  }

  let { examId, students = [], submissions = [], onRosterChanged = () => {} }: Props = $props();

  let newName = $state("");
  let newStudentNumber = $state("");
  let newFallbackCode = $state("");
  let showBulk = $state(false);
  let bulkText = $state("");

  let editingPseudonymId: string | null = $state(null);
  let editName = $state("");
  let editStudentNumber = $state("");

  let submissionMap = $state.raw(new Map<string, SubmissionRecord>());
  // Only the newest build may write, so a slower stale build cannot overwrite a newer map.
  let submissionMapSeq = 0;
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

  async function handleAddSingle() {
    if (!newName.trim()) return;
    const key = get(sessionStore).sessionKey;
    const pseudonymId = crypto.randomUUID();

    const student: StudentRecord = {
      pseudonymId,
      examId,
      studentName: newName.trim(),
      studentNumber: newStudentNumber.trim() || undefined,
      fallbackCode: newFallbackCode.trim() || undefined,
      piiCt: new Uint8Array(0),
      piiIv: new Uint8Array(12),
    };
    await studentRepository.save(student, key);

    const sub: SubmissionRecord = {
      id: crypto.randomUUID(),
      examId,
      pseudonymHash: pseudonymId,
      createdAt: new Date().toISOString(),
    };
    await saveSubmissionEncrypted(sub, key);

    newName = "";
    newStudentNumber = "";
    newFallbackCode = "";
    onRosterChanged();
  }

  async function handleAddBulk() {
    if (!bulkText.trim()) return;
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const key = get(sessionStore).sessionKey;

    for (const line of lines) {
      const parts = line.split(/[\t;,]/).map((p) => p.trim());
      const studentName = parts[0];
      if (!studentName) continue;
      const studentNumber = parts[1] || undefined;
      const pseudonymId = crypto.randomUUID();

      const student: StudentRecord = {
        pseudonymId,
        examId,
        studentName,
        studentNumber,
        piiCt: new Uint8Array(0),
        piiIv: new Uint8Array(12),
      };
      await studentRepository.save(student, key);

      const sub: SubmissionRecord = {
        id: crypto.randomUUID(),
        examId,
        pseudonymHash: pseudonymId,
        createdAt: new Date().toISOString(),
      };
      await saveSubmissionEncrypted(sub, key);
    }

    bulkText = "";
    showBulk = false;
    onRosterChanged();
  }

  function startEdit(st: StudentRecord) {
    editingPseudonymId = st.pseudonymId;
    editName = st.studentName || "";
    editStudentNumber = st.studentNumber || "";
  }

  async function saveEdit(st: StudentRecord) {
    if (!editName.trim()) return;
    const key = get(sessionStore).sessionKey;
    const updated: StudentRecord = {
      ...st,
      studentName: editName.trim(),
      studentNumber: editStudentNumber.trim() || undefined,
    };
    await studentRepository.save(updated, key);
    editingPseudonymId = null;
    onRosterChanged();
  }

  function cancelEdit() {
    editingPseudonymId = null;
  }

  async function handleDelete(st: StudentRecord) {
    if (!confirm(translate("grading.manual.roster.deleteConfirm", { name: st.studentName || st.studentNumber || st.pseudonymId }))) {
      return;
    }
    const key = get(sessionStore).sessionKey;
    const sub = submissionMap.get(st.pseudonymId);
    if (sub) {
      await submissionRepository.delete(examId, sub.id);
    }
    await studentRepository.delete(examId, st.pseudonymId);
    onRosterChanged();
  }

  const bulkPlaceholder = "Musterfrau, Karin\t12345\nMustermann, Peter\t67890\n ...";
</script>

<div class="flex min-w-0 flex-col gap-6">
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

  {#if students.length === 0}
    <EmptyState title={$t("grading.manual.roster.emptyState")} />
  {:else}
    <TableScroller>
      <table class="data-table data-table-compact data-table-sticky data-table-hover">
        <thead>
          <tr>
            <th>{$t("grading.manual.roster.colNum")}</th>
            <th>{$t("grading.manual.roster.colName")}</th>
            <th>{$t("grading.manual.roster.colNumber")}</th>
            <th>{$t("grading.manual.roster.colPseudonym")}</th>
            <th>{$t("grading.manual.roster.colType")}</th>
            <th>{$t("grading.manual.roster.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each students as st, i (st.pseudonymId)}
            {@const sub = submissionMap.get(st.pseudonymId)}
            {@const isScanned = !!(sub?.scanCt || sub?.scanIv || sub?.hasScan)}
            <tr>
              <td>{i + 1}</td>
              <td>
                {#if editingPseudonymId === st.pseudonymId}
                  <TextInput size="sm" bind:value={editName} />
                {:else}
                  <strong>{st.studentName || $t("grading.manual.roster.unnamed")}</strong>
                {/if}
              </td>
              <td>
                {#if editingPseudonymId === st.pseudonymId}
                  <TextInput size="sm" bind:value={editStudentNumber} />
                {:else}
                  {st.studentNumber || "-"}
                {/if}
              </td>
              <td>
                <span class="font-mono text-sm text-muted">
                  {st.fallbackCode || st.pseudonymId.slice(0, 8)}
                </span>
              </td>
              <td>
                {#if isScanned}
                  <Badge severity="info" size="xs">{$t("grading.manual.roster.scanned")}</Badge>
                {:else}
                  <Badge severity="success" size="xs">{$t("grading.manual.roster.manual")}</Badge>
                {/if}
              </td>
              <td class="whitespace-nowrap">
                <div class="flex gap-1.5">
                  {#if editingPseudonymId === st.pseudonymId}
                    <Button size="sm" onClick={() => saveEdit(st)}>{$t("common.save")}</Button>
                    <Button size="sm" variant="outlined" severity="secondary" onClick={cancelEdit}>{$t("common.cancel")}</Button>
                  {:else}
                    <Button size="sm" variant="outlined" severity="secondary" onClick={() => startEdit(st)}>{$t("common.edit")}</Button>
                    <Button size="sm" variant="outlined" severity="danger" onClick={() => handleDelete(st)}>{$t("common.delete")}</Button>
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
