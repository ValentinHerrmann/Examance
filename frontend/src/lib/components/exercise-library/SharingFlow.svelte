<script lang="ts">
  // Sharing actions of the exercise library (issue #65, docs/dev/exercise_sharing.md): share or stop sharing one group, everything at once, the sharing pause, copying a shared group, duplicating an own one, and resyncing or unlinking a copy. Its dialogs live here; the page calls the exported functions.
  import { ApiError, apiErrorMessage } from "#lib/api/client";
  import {
    applyResync,
    bulkSetSharing,
    copySharedExercise,
    loadResyncPreview,
    setExerciseSharing,
    setSharingPaused,
    unlinkSource,
    type ResyncPreview,
  } from "#lib/api/exerciseSharing";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { getGroupRepresentative, groupIsShared, type ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import { t, translate, type TranslationKey } from "#lib/i18n";
  import { exerciseRepository } from "#lib/repositories/exerciseRepository";
  import { capabilitiesStore, markSharingPaused } from "#lib/stores/capabilities";
  import { sessionStore } from "#lib/stores/session";
  import { ConfirmDialog } from "#lib/components/ui";
  import ResyncModal from "./ResyncModal.svelte";
  import ShareExerciseModal from "./ShareExerciseModal.svelte";

  interface Props {
    /** The group being copied or duplicated, and whether the pause is being switched: for the page's busy states. */
    copyingGroupId?: string;
    duplicatingGroupId?: string;
    pauseBusy?: boolean;
    /** Success line for the page's notice ("" clears it). */
    onNotice: (message: string) => void;
    /** Error line for the page, for actions without a dialog ("" clears it). */
    onError: (message: string) => void;
    /** Reloads the library after a change. */
    onSaved: () => Promise<void> | void;
  }

  let {
    copyingGroupId = $bindable(""),
    duplicatingGroupId = $bindable(""),
    pauseBusy = $bindable(false),
    onNotice,
    onError,
    onSaved,
  }: Props = $props();

  /** The server's message, else the given fallback text. */
  const failText = (err: unknown, fallback: TranslationKey) => apiErrorMessage(err, translate(fallback));

  let sharingPaused = $derived($capabilitiesStore?.sharingPaused === true);
  let shareGroup: ExerciseGroup | null = $state.raw(null);
  let isSharing = $state(false);
  let shareError = $state("");
  let isResyncOpen = $state(false);
  let resyncGroupId = $state("");
  let resyncPreview: ResyncPreview | null = $state.raw(null);
  let isResyncing = $state(false);
  let resyncError = $state("");
  let unlinkGroup: ExerciseGroup | null = $state.raw(null);
  let isUnlinking = $state(false);
  let bulkMode: "bulkShare" | "bulkUnshare" | null = $state(null);
  let isBulkBusy = $state(false);
  let bulkError = $state("");

  export function share(group: ExerciseGroup) {
    shareError = "";
    shareGroup = group;
  }

  export function bulk(mode: "bulkShare" | "bulkUnshare") {
    bulkError = "";
    bulkMode = mode;
  }

  export function unlink(group: ExerciseGroup) {
    unlinkGroup = group;
  }

  async function handleBulkConfirm() {
    if (!bulkMode) return;
    isBulkBusy = true;
    bulkError = "";
    try {
      const res = await bulkSetSharing(bulkMode === "bulkShare");
      onNotice(
        bulkMode === "bulkShare"
          ? translate("exercises.sharing.bulk.sharedDone", { groups: res.groups, skipped: res.skippedCopies })
          : translate("exercises.sharing.bulk.unsharedDone", { groups: res.groups }),
      );
      bulkMode = null;
      await onSaved();
    } catch (err) {
      bulkError = failText(err, "exercises.sharing.shareModal.failed");
    } finally {
      isBulkBusy = false;
    }
  }

  /** Pause hides everything shared without forgetting the per-group choices. */
  export async function togglePause() {
    pauseBusy = true;
    onError("");
    try {
      await setSharingPaused(!sharingPaused);
      markSharingPaused(!sharingPaused);
    } catch (err) {
      onError(failText(err, "exercises.sharing.pause.failed"));
    } finally {
      pauseBusy = false;
    }
  }

  async function handleShareConfirm() {
    if (!shareGroup) return;
    const group = shareGroup;
    isSharing = true;
    shareError = "";
    try {
      await setExerciseSharing(getGroupRepresentative(group).id, !groupIsShared(group));
      shareGroup = null;
      await onSaved();
    } catch (err) {
      shareError = failText(err, "exercises.sharing.shareModal.failed");
    } finally {
      isSharing = false;
    }
  }

  export async function copy(group: ExerciseGroup) {
    copyingGroupId = group.groupId;
    onNotice("");
    onError("");
    try {
      await copySharedExercise(getGroupRepresentative(group).id);
      onNotice(translate("exercises.sharing.copied", { name: group.name }));
      await onSaved();
    } catch (err) {
      onError(failText(err, "exercises.sharing.copyFailed"));
    } finally {
      copyingGroupId = "";
    }
  }

  /** Own group copied as a new private group to start a similar exercise from (issue #121). */
  export async function duplicate(group: ExerciseGroup, rep: ExerciseRecord) {
    duplicatingGroupId = group.groupId;
    onNotice("");
    onError("");
    try {
      await exerciseRepository.duplicate(rep.id);
      onNotice(translate("exercises.groupList.duplicated", { name: group.name }));
      await onSaved();
    } catch (err) {
      onError(failText(err, "exercises.groupList.duplicateFailed"));
    } finally {
      duplicatingGroupId = "";
    }
  }

  /** Keeps the shown preview until the new one is in; a late answer for another group is dropped. */
  async function fetchResyncPreview(groupId: string) {
    try {
      const preview = await loadResyncPreview(groupId);
      if (resyncGroupId === groupId) resyncPreview = preview;
    } catch (err) {
      if (resyncGroupId === groupId) resyncError = failText(err, "exercises.sharing.resyncModal.failed");
    }
  }

  export function resync(group: ExerciseGroup) {
    resyncGroupId = group.groupId;
    resyncPreview = null;
    resyncError = "";
    isResyncOpen = true;
    fetchResyncPreview(group.groupId);
  }

  function closeResync() {
    isResyncOpen = false;
    resyncGroupId = "";
  }

  /** Applies the chosen, reviewed variants; the server refuses (409) if one moved on meanwhile. */
  async function handleApplyResync(selected: Set<string>, overrides: Record<string, string>) {
    const preview = resyncPreview;
    if (!preview) return;
    const groupId = preview.groupId;
    isResyncing = true;
    resyncError = "";
    try {
      await applyResync(preview, selected, overrides);
      if (resyncGroupId === groupId) closeResync();
      onNotice(translate("exercises.sharing.resyncModal.applied"));
      await onSaved();
    } catch (err) {
      if (resyncGroupId !== groupId) return;
      resyncError = failText(err, "exercises.sharing.resyncModal.failed");
      if (err instanceof ApiError && err.code === "ERR_SHARE_SOURCE_CHANGED") await fetchResyncPreview(groupId);
    } finally {
      isResyncing = false;
    }
  }

  async function handleUnlinkConfirm() {
    if (!unlinkGroup) return;
    isUnlinking = true;
    onError("");
    try {
      await unlinkSource(unlinkGroup.groupId);
      unlinkGroup = null;
      await onSaved();
    } catch (err) {
      unlinkGroup = null;
      onError(failText(err, "exercises.sharing.unlinkFailed"));
    } finally {
      isUnlinking = false;
    }
  }
</script>

<ShareExerciseModal
  open={!!bulkMode}
  mode={bulkMode ?? "bulkShare"}
  email={$sessionStore.email ?? ""}
  busy={isBulkBusy}
  error={bulkError}
  onConfirm={handleBulkConfirm}
  onClose={() => (bulkMode = null)}
/>

<ShareExerciseModal
  open={!!shareGroup}
  shared={shareGroup ? groupIsShared(shareGroup) : false}
  email={$sessionStore.email ?? ""}
  name={shareGroup?.name ?? ""}
  busy={isSharing}
  error={shareError}
  onConfirm={handleShareConfirm}
  onClose={() => (shareGroup = null)}
/>

<ResyncModal
  open={isResyncOpen}
  preview={resyncPreview}
  busy={isResyncing}
  error={resyncError}
  onRetry={() => {
    resyncError = "";
    fetchResyncPreview(resyncGroupId);
  }}
  onApply={handleApplyResync}
  onClose={closeResync}
/>

<ConfirmDialog
  open={!!unlinkGroup}
  title={$t("exercises.sharing.unlinkTitle")}
  message={$t("exercises.sharing.unlinkBody")}
  confirmText={$t("exercises.sharing.unlink")}
  cancelText={$t("common.cancel")}
  busy={isUnlinking}
  onConfirm={handleUnlinkConfirm}
  onCancel={() => (unlinkGroup = null)}
/>
