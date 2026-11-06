<script lang="ts">
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { onDestroy, untrack } from "svelte";
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { getPresetCutoffs } from "#lib/analytics/gradingKey";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import type { ExamRecord, GradingKeyConfig } from "#lib/db/schema";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import { t, translate } from "#lib/i18n";
  import GradingKeyEditor from "#lib/components/GradingKeyEditor.svelte";
  import { Card, SaveStatus } from "#lib/components/ui";
  import { createAutosave } from "#lib/utils/autosave";

  /** The exam's grading key next to the distribution it changes (issue #212): edits recompute the statistics live and save themselves (issue #228). */
  interface Props {
    exam: ExamRecord;
    /** Every edit, as a plain copy, so the page recomputes the statistics. */
    onPreview: (key: GradingKeyConfig) => void;
    onSaved: (exam: ExamRecord) => void;
  }

  let { exam, onPreview, onSaved }: Props = $props();

  const fallback = (): GradingKeyConfig => ({ preset: "linear_50", cutoffs: getPresetCutoffs("linear_50") });
  // Deep edit buffer: GradingKeyEditor mutates it.
  let edit: GradingKeyConfig = $state(fallback());
  let initial = $state("");

  function reset() {
    edit = structuredClone(exam.gradingKey ?? fallback());
    initial = JSON.stringify(edit);
  }

  let current = $derived(JSON.stringify(edit));
  let dirty = $derived(current !== initial);

  async function save() {
    // Taken at the start: an edit during the request schedules the next save.
    const gradingKey = $state.snapshot(edit) as GradingKeyConfig;
    const json = JSON.stringify(gradingKey);
    if (json === initial) return;
    if (get(isAuthenticated)) await api.patch(`/exams/${exam.id}`, { grading_key: gradingKey }, { silentError: true });
    const updated: ExamRecord = { ...exam, gradingKey };
    await saveExamEncrypted(updated, get(sessionStore).sessionKey);
    initial = json;
    onSaved(updated);
  }

  const autosave = createAutosave({ run: save, message: (err: any) => translate("exam.page.metadata.saveFailed", { message: err?.message ?? String(err) }) });

  // Leaving the page still saves the last edit.
  onDestroy(() => autosave.dispose());

  let loadedFor = "";
  $effect.pre(() => {
    const id = exam.id;
    if (loadedFor !== id) {
      loadedFor = id;
      untrack(reset);
    }
  });

  $effect.pre(() => {
    const json = current;
    const d = dirty;
    untrack(() => {
      onPreview(JSON.parse(json));
      if (d) autosave.schedule();
    });
  });
</script>

<Card>
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <h2 class="m-0 text-base font-semibold text-content">{$t("exam.overview.gradingKey")}</h2>
    <InfoTip text={$t("stats.gradingKey.intro")} />
    <SaveStatus status={$autosave} class="ml-auto" />
  </div>
  <GradingKeyEditor bind:gradingKey={edit} />
</Card>
