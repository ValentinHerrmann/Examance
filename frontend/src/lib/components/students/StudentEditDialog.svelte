<script lang="ts">
  /** The one place to edit students, one or many at once (issue #209): name, student number, Mebis ID, Artemis ID and e-mail per row. Side effects (renamed scanned students, changed IDs, duplicates, removed addresses) are listed before saving; the teacher may save anyway, only an empty name blocks. */
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal, TableScroller, TextInput, actionIcons } from "#lib/components/ui";
  import type { StudentRecord } from "#lib/db/schema";
  import { editWarnings, EDITABLE_FIELDS, newListedStudent, nextClassPosition, type EditableField } from "#lib/students/classList";
  import { nameKey } from "#lib/lms/contacts";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { sessionStore } from "#lib/stores/session";

  interface Props {
    students: readonly StudentRecord[];
    /** Every student of the exam, so duplicates across unselected rows are found. */
    all: readonly StudentRecord[];
    hasSubmission: (student: StudentRecord) => boolean;
    onSaved: () => void;
    onClose: () => void;
    /** Adds one new student to this exam instead of editing `students` (issue #212); it gets a sticker payload like an imported one. */
    createIn?: string;
  }

  let { students, all, hasSubmission, onSaved, onClose, createIn }: Props = $props();

  const blankRow = () => Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, ""])) as Record<EditableField, string>;
  // Local edit buffer: one plain object per row.
  let rows = $state(
    untrack(() => (createIn ? [blankRow()] : students.map((st) => Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, st[f] ?? ""])) as Record<EditableField, string>))),
  );
  let accepted = $state(false);
  let busy = $state(false);
  let error = $state("");

  const COLUMNS: Record<EditableField, Parameters<typeof $t>[0]> = {
    studentName: "lms.students.colName",
    studentNumber: "lms.students.colNumber",
    mebisId: "lms.students.colMebisId",
    artemisId: "lms.students.colArtemisId",
    email: "lms.students.colEmail",
  };

  function edited(): StudentRecord[] {
    return students.map((st, i) => {
      const row = rows[i];
      const next: StudentRecord = { ...st };
      for (const f of EDITABLE_FIELDS) next[f] = row[f].trim() || undefined;
      return next;
    });
  }

  let after = $derived(edited());
  let changed = $derived(after.filter((st, i) => EDITABLE_FIELDS.some((f) => (st[f] ?? "") !== (students[i][f] ?? ""))));
  let createNotices = $derived.by(() => {
    const name = rows[0]?.studentName.trim() ?? "";
    if (!name) return [{ key: "lms.students.edit.warn.emptyName" as const, name: "", blocking: true }];
    return all.some((st) => nameKey(st.studentName) === nameKey(name)) ? [{ key: "lms.students.add.duplicateName" as const, name, blocking: false }] : [];
  });
  let notices = $derived.by(() => {
    if (createIn) return createNotices;
    const byKey = new Map(after.map((st) => [st.pseudonymHmac, st]));
    const whole = all.map((st) => byKey.get(st.pseudonymHmac) ?? st);
    return editWarnings(students, after, whole, hasSubmission);
  });
  let blocking = $derived(notices.some((n) => n.blocking));
  let warnings = $derived(notices.filter((n) => !n.blocking));

  async function save() {
    busy = true;
    error = "";
    try {
      const key = get(sessionStore).sessionKey;
      if (createIn) {
        const position = nextClassPosition(all);
        const student = await newListedStudent(createIn, rows[0]);
        await studentRepository.save(position === undefined ? student : { ...student, classPosition: position }, key);
        onSaved();
        return;
      }
      for (const st of changed) await studentRepository.save(st, key); // NOSONAR: one row at a time keeps the error report simple
      onSaved();
    } catch (err) {
      error = `${$t("lms.students.edit.failed")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      busy = false;
    }
  }
</script>

<Modal open={true} size="large" title={createIn ? $t("lms.students.add.title") : students.length === 1 ? $t("lms.students.edit.titleOne") : $t("lms.students.edit.title", { count: students.length })} onClose={busy ? undefined : onClose} {error}>
  <div class="flex min-w-0 flex-col gap-4">
    <TableScroller maxHeight="max-h-96">
      <table class="data-table data-table-compact w-full">
        <thead>
          <tr>{#each EDITABLE_FIELDS as f (f)}<th>{$t(COLUMNS[f])}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each rows as row, i (createIn ? i : students[i].pseudonymHmac)}
            <tr>
              {#each EDITABLE_FIELDS as f (f)}
                <td><TextInput size="sm" type={f === "email" ? "email" : "text"} bind:value={row[f]} aria-label={$t(COLUMNS[f])} disabled={busy} /></td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>

    {#if notices.length}
      <Alert severity={blocking ? "danger" : "warning"} title={$t("lms.students.edit.warnTitle")}>
        <ul class="m-0 list-disc pl-5">
          {#each notices as n, i (i)}<li>{$t(n.key, { name: n.name })}</li>{/each}
        </ul>
      </Alert>
      {#if warnings.length && !blocking}
        <Checkbox bind:checked={accepted} label={$t("lms.students.edit.accept")} disabled={busy} />
      {/if}
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" icon={actionIcons.remove} disabled={busy} onClick={onClose}>{$t("common.cancel")}</Button>
    <Button icon={createIn ? actionIcons.add : actionIcons.edit} loading={busy} disabled={busy || (!createIn && !changed.length) || blocking || (warnings.length > 0 && !accepted)} onClick={save}>
      {createIn ? $t("lms.students.add.save") : $t("lms.students.edit.save", { count: changed.length })}
    </Button>
  {/snippet}
</Modal>
