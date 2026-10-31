<script lang="ts">
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { db } from "#lib/db/db";
  import { sessionStore } from "#lib/stores/session";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { encryptExercise, loadExercisesEncrypted } from "#lib/db/dbEncryption";
  import { api, apiErrorMessage } from "#lib/api/client";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import { isServerBacked } from "#lib/utils/serverBacked";
  import { createDirtyClose } from "#lib/utils/dirtyClose.svelte";
  import { translate } from "#lib/i18n";
  import ExerciseDiffModal from "./ExerciseDiffModal.svelte";

  interface Props {
    /** The library: a side shows the saved text again after a reload. */
    exercises: ExerciseRecord[];
    /** Reloads the library after a side was saved. */
    onSaved: () => Promise<void> | void;
  }

  let { exercises, onSaved }: Props = $props();

  let isOpen = $state(false);
  let error = $state("");
  let leftId: string = $state("");
  let rightId: string = $state("");
  let groupExercises: ExerciseRecord[] = $state.raw([]);
  let leftLatex: string = $state("");
  let rightLatex: string = $state("");
  let isSavingLeft = $state(false);
  let isSavingRight = $state(false);
  let lastLoadedLeftId = $state("");
  let lastLoadedRightId = $state("");

  let activeGroupExercises = $derived(groupExercises.map(
    (e) => exercises.find((x) => x.id === e.id) || e
  ));

  // Lazy: only look up exercises when the diff modal is open
  let leftEx = $derived(isOpen
    ? (exercises.find((e) => e.id === leftId) || activeGroupExercises.find((e) => e.id === leftId))
    : null);
  let rightEx = $derived(isOpen
    ? (exercises.find((e) => e.id === rightId) || activeGroupExercises.find((e) => e.id === rightId))
    : null);

  let isLeftDirty = $derived(leftEx ? leftLatex !== (leftEx.latexBody || "") : false);
  let isRightDirty = $derived(rightEx ? rightLatex !== (rightEx.latexBody || "") : false);

  const dirtyClose = createDirtyClose({
    isDirty: () => isLeftDirty || isRightDirty,
    onClose: () => (isOpen = false),
  });

  /** Opens the diff of `ex` against another version or variant of its group. */
  export async function open(ex: ExerciseRecord) {
    error = "";
    let groupExs: ExerciseRecord[] = [];
    const key = get(sessionStore).sessionKey;

    if (isServerBacked()) {
      try {
        if (ex.exerciseGroupId) {
          const remoteExs = (await api.get(`/exercises?group_id=${ex.exerciseGroupId}&current_only=false`)) as any[];
          groupExs = remoteExs.map((e: any) => ({
            id: e.id,
            teacherId: e.teacher_id,
            name: e.name,
            topicTag: e.topic_tag,
            grade: e.grade || undefined,
            subject: e.subject || undefined,
            latexBody: e.latex_body,
            maxPoints: e.max_points,
            version: e.version || 1,
            questionType: e.question_type || "free_text",
            penalty: e.penalty || 0,
            exerciseGroupId: e.exercise_group_id || undefined,
            variantKey: e.variant_key || undefined,
            isCurrent: e.is_current,
          }));
        }
      } catch (err) {
        console.warn("Failed to fetch group exercises for diff:", err);
      }
    }

    if (groupExs.length === 0) {
      try {
        const allLocal = await loadExercisesEncrypted(key);
        if (ex.exerciseGroupId) {
          groupExs = allLocal.filter((e) => e.exerciseGroupId === ex.exerciseGroupId);
        }
        if (groupExs.length === 0) {
          groupExs = allLocal.filter((e) => (e.name && ex.name && e.name === ex.name) || e.id === ex.id);
        }
      } catch (err) {
        console.warn("Failed to load local exercises for diff:", err);
        error = apiErrorMessage(err, translate("exercises.page.loadFailed"));
      }
    }

    if (groupExs.length === 0) {
      groupExs = [ex];
    }

    groupExs.sort((a, b) => {
      const vA = a.variantKey || "";
      const vB = b.variantKey || "";
      if (vA !== vB) return vA.localeCompare(vB);
      return (a.version || 1) - (b.version || 1);
    });

    groupExercises = groupExs;
    leftId = ex.id;
    const other = groupExercises.find((e) => e.id !== ex.id) || groupExercises[0];
    rightId = other.id;
    leftLatex = ex.latexBody || "";
    rightLatex = (groupExercises.find((e) => e.id === rightId) || ex).latexBody || "";
    lastLoadedLeftId = leftId;
    lastLoadedRightId = rightId;
    dirtyClose.cancel();
    isOpen = true;
  }

  async function saveSide(side: "left" | "right") {
    const ex = side === "left" ? leftEx : rightEx;
    const latex = side === "left" ? leftLatex : rightLatex;
    if (!ex) return;
    if (side === "left") isSavingLeft = true;
    else isSavingRight = true;
    error = "";
    try {
      const updatedMaxPoints = parseExerciseScore(latex);
      const key = get(sessionStore).sessionKey;

      if (isServerBacked()) {
        await api.patch(`/exercises/${ex.id}`, { latex_body: latex, max_points: updatedMaxPoints });
      }

      const updatedRecord: ExerciseRecord = {
        ...ex,
        latexBody: latex,
        maxPoints: updatedMaxPoints,
        updatedAt: new Date().toISOString(),
      };
      await db.exercises.put(await encryptExercise(updatedRecord, key));
      await onSaved();
    } catch (err: any) {
      error = translate(
        side === "left" ? "exercises.page.diffSaveLeftFailed" : "exercises.page.diffSaveRightFailed",
        { message: err.message }
      );
    } finally {
      if (side === "left") isSavingLeft = false;
      else isSavingRight = false;
    }
  }

  $effect.pre(() => {
    const ex = leftEx;
    const shown = isOpen;
    const id = leftId;
    const loaded = lastLoadedLeftId;
    if (ex && shown && id !== loaded) {
      untrack(() => {
        leftLatex = ex.latexBody || "";
        lastLoadedLeftId = id;
      });
    }
  });

  $effect.pre(() => {
    const ex = rightEx;
    const shown = isOpen;
    const id = rightId;
    const loaded = lastLoadedRightId;
    if (ex && shown && id !== loaded) {
      untrack(() => {
        rightLatex = ex.latexBody || "";
        lastLoadedRightId = id;
      });
    }
  });
</script>

<ExerciseDiffModal
  {isOpen}
  {error}
  activeDiffGroupExercises={activeGroupExercises}
  bind:diffLeftId={leftId}
  bind:diffRightId={rightId}
  diffLeftEx={leftEx}
  diffRightEx={rightEx}
  bind:diffLeftLatex={leftLatex}
  bind:diffRightLatex={rightLatex}
  isDiffLeftDirty={isLeftDirty}
  isDiffRightDirty={isRightDirty}
  isSavingDiffLeft={isSavingLeft}
  isSavingDiffRight={isSavingRight}
  onSaveLeft={() => saveSide("left")}
  onSaveRight={() => saveSide("right")}
  onRequestClose={dirtyClose.request}
  showConfirmClose={dirtyClose.confirming}
  onForceCloseConfirm={dirtyClose.force}
  onCancelConfirmClose={dirtyClose.cancel}
/>
