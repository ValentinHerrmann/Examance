<script lang="ts">
  import { get } from "svelte/store";
  import { t, translate } from "#lib/i18n";
  import { sessionStore } from "#lib/stores/session";
  import { loadExercisesEncrypted } from "#lib/db/dbEncryption";
  import { exerciseRepository } from "#lib/repositories/exerciseRepository";
  import { setExerciseSharing } from "#lib/api/exerciseSharing";
  import { loadExamUsage, type ExamUsageEntry } from "#lib/exercise-library/examUsage";
  import { getGroupRepresentative, groupIsCopy, type ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import { saveGroupMetadata, type GroupMetadata } from "#lib/exercise-library/saveGroupMetadata";
  import { newTrashGroup } from "#lib/trash/group";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import { recordValue } from "#lib/utils/recentValues";
  import type { BulkField, BulkItem } from "#lib/bulk/bulkEdit";
  import BulkEditDialog from "#lib/components/common/BulkEditDialog.svelte";
  import DeleteWithUsageModal from "#lib/components/common/DeleteWithUsageModal.svelte";
  import ShareExerciseModal from "./ShareExerciseModal.svelte";

  /** The library's actions on several exercise groups (issue #261): edit topic, grade and subject, share or stop sharing, delete unused groups. Opened through `open()`. */
  interface Props {
    /** Reloads the library after a change. */
    onSaved: () => Promise<void> | void;
    /** Success line for the page's notice. */
    onNotice: (message: string) => void;
  }

  let { onSaved, onNotice }: Props = $props();

  type Kind = "edit" | "share" | "unshare" | "delete";
  let kind = $state<Kind | null>(null);
  let targets = $state.raw<ExerciseGroup[]>([]);
  let busy = $state(false);
  let error = $state("");
  let usageLoading = $state(false);
  let usage = $state.raw(new Map<string, ExamUsageEntry[]>());
  let usageSeq = 0;

  export function open(next: Kind, groups: ExerciseGroup[]) {
    if (!groups.length) return;
    targets = groups;
    error = "";
    kind = next;
    if (next === "delete") void loadUsage(groups);
  }

  function close() {
    kind = null;
    targets = [];
  }

  async function loadUsage(groups: ExerciseGroup[]) {
    const seq = ++usageSeq;
    usageLoading = true;
    usage = new Map();
    try {
      const found = await Promise.all(groups.map(async (g) => [g.groupId, await loadExamUsage(g.allMembers.map((m) => m.ex.id))] as const));
      if (seq === usageSeq) usage = new Map(found);
    } catch (err) {
      if (seq === usageSeq) error = (err as Error)?.message ?? String(err);
    } finally {
      if (seq === usageSeq) usageLoading = false;
    }
  }

  const nameOf = (g: ExerciseGroup) => g.name || translate("exercises.untitled");

  // Group metadata that is shared across the selection; the name stays per group.
  const FIELD_KEYS = ["topicTag", "grade", "subject"] as const satisfies readonly (keyof GroupMetadata)[];
  let fields = $derived<BulkField[]>([
    { key: "topicTag", label: $t("exercises.groupEditModal.topicLabel"), storageKey: "exercise.topic", placeholder: "_General", maxlength: 200 },
    { key: "grade", label: $t("exercises.groupEditModal.gradeLabel"), storageKey: "exercise.grade", maxlength: 50 },
    { key: "subject", label: $t("exercises.groupEditModal.subjectLabel"), storageKey: "exercise.subject", maxlength: 100 },
  ]);
  let items = $derived<BulkItem[]>(targets.map((g) => ({ id: g.groupId, title: nameOf(g), values: { topicTag: g.topicTag, grade: g.grade ?? "", subject: g.subject ?? "" } })));

  async function run(work: (g: ExerciseGroup) => Promise<boolean | void>, skip: (g: ExerciseGroup) => boolean = () => false) {
    busy = true;
    error = "";
    const failed: string[] = [];
    let done = 0;
    for (const g of targets) {
      if (skip(g)) continue;
      try {
        if ((await work(g)) !== false) done++; // NOSONAR: one group at a time, so a failure is reported per group
      } catch (err) {
        failed.push(`${nameOf(g)} (${(err as Error)?.message ?? err})`);
      }
    }
    busy = false;
    await onSaved();
    if (failed.length) error = translate("exercises.bulk.failed", { items: failed.join(", ") });
    return { done, failed: failed.length };
  }

  async function applyEdit(patch: Record<string, string>) {
    const meta: Partial<GroupMetadata> = {};
    for (const key of FIELD_KEYS) if (key in patch) meta[key] = patch[key];
    const key = get(sessionStore).sessionKey;
    const all = await loadExercisesEncrypted(key);
    const changed = new Set(items.filter((item) => FIELD_KEYS.some((k) => k in patch && (item.values[k] ?? "") !== patch[k])).map((i) => i.id));
    const res = await run((g) => saveGroupMetadata(g, meta, key, all), (g) => !changed.has(g.groupId));
    if (meta.topicTag) recordValue("exercise.topic", meta.topicTag);
    if (meta.grade) recordValue("exercise.grade", meta.grade);
    if (meta.subject) recordValue("exercise.subject", meta.subject);
    if (!res.failed) close();
  }

  async function applySharing() {
    const share = kind === "share";
    // Copies of others' groups are never shared as one's own (same rule as the library-wide action).
    const skipCopy = (g: ExerciseGroup) => share && groupIsCopy(g);
    const skipped = share ? targets.filter(skipCopy).length : 0;
    const res = await run(async (g) => {
      await setExerciseSharing(getGroupRepresentative(g).id, share);
    }, skipCopy);
    onNotice(share ? translate("exercises.bulk.sharedDone", { groups: res.done, skipped }) : translate("exercises.bulk.unsharedDone", { groups: res.done }));
    if (!res.failed) close();
  }

  let kept = $derived(targets.filter((g) => (usage.get(g.groupId) ?? []).length > 0));
  let deletable = $derived(targets.filter((g) => !(usage.get(g.groupId) ?? []).length));

  async function confirmDelete() {
    // One trash entry for the whole action (issue #125).
    const group = newTrashGroup();
    const res = await run(async (g) => {
      for (const m of g.allMembers) await exerciseRepository.delete(m.ex.id, { group }); // NOSONAR: sequential deletes
    }, (g) => (usage.get(g.groupId) ?? []).length > 0);
    if (!res.failed) close();
  }
</script>

{#if kind === "edit"}
  <BulkEditDialog
    title={$t("exercises.bulk.editTitle", { count: targets.length })}
    {fields}
    {items}
    applyLabel={(count) => $t("exercises.bulk.apply", { count })}
    {busy}
    {error}
    onApply={applyEdit}
    onClose={close}
  />
{/if}

<ShareExerciseModal
  open={kind === "share" || kind === "unshare"}
  mode="selected"
  shared={kind === "unshare"}
  names={targets.map(nameOf)}
  email={$sessionStore.email ?? ""}
  {busy}
  {error}
  onConfirm={applySharing}
  onClose={close}
/>

<DeleteWithUsageModal
  open={kind === "delete"}
  title={$t("exercises.bulk.deleteTitle", { count: targets.length })}
  {usageLoading}
  loadingText={$t("exercises.bulk.checkingUsage")}
  usageTitle={$t("exercises.bulk.keptTitle")}
  usageText={kept.length ? (deletable.length ? $t("exercises.bulk.deleteConfirm", { count: deletable.length }) : $t("exercises.bulk.allKept")) : ""}
  usageHint={$t("exercises.bulk.keptHint")}
  items={kept.map((g) => ({ id: g.groupId, title: nameOf(g), meta: $t("exercises.bulk.usedIn", { exams: (usage.get(g.groupId) ?? []).map((e) => e.title).join(", ") }) }))}
  plainText={$t("exercises.bulk.deleteConfirm", { count: deletable.length })}
  restoreHint={$t("common.trashHint", { days: TRASH_DAYS })}
  confirmDisabled={!deletable.length}
  {busy}
  {error}
  onConfirm={confirmDelete}
  onClose={close}
/>
