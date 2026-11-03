<script lang="ts">
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { getPresetCutoffs } from "#lib/analytics/gradingKey";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import type { ExamRecord, GradingKeyConfig } from "#lib/db/schema";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import { t, translate } from "#lib/i18n";
  import GradingKeyEditor from "#lib/components/GradingKeyEditor.svelte";
  import { Alert, Button, Card } from "#lib/components/ui";

  /** The exam's grading key next to the distribution it changes (issue #212): edits recompute the statistics live, Save stores them. */
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
  let busy = $state(false);
  let error = $state("");
  let saved = $state(false);

  function reset() {
    edit = structuredClone(exam.gradingKey ?? fallback());
    initial = JSON.stringify(edit);
    error = "";
  }

  let current = $derived(JSON.stringify(edit));
  let dirty = $derived(current !== initial);

  async function save() {
    const gradingKey = $state.snapshot(edit) as GradingKeyConfig;
    busy = true;
    error = "";
    try {
      if (get(isAuthenticated)) await api.patch(`/exams/${exam.id}`, { grading_key: gradingKey });
      const updated: ExamRecord = { ...exam, gradingKey };
      await saveExamEncrypted(updated, get(sessionStore).sessionKey);
      initial = JSON.stringify(gradingKey);
      saved = true;
      onSaved(updated);
    } catch (err: any) {
      error = translate("exam.page.metadata.saveFailed", { message: err.message });
    } finally {
      busy = false;
    }
  }

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
    untrack(() => {
      if (json !== initial) saved = false;
      onPreview(JSON.parse(json));
    });
  });
</script>

<Card title={$t("exam.overview.gradingKey")}>
  <p class="mt-0 mb-4 text-sm text-muted">{$t("stats.gradingKey.intro")}</p>
  <GradingKeyEditor bind:gradingKey={edit} />
  {#if error}<Alert severity="danger" class="mt-4">{error}</Alert>{/if}
  {#if saved}<Alert severity="success" class="mt-4">{$t("stats.gradingKey.saved")}</Alert>{/if}
  <div class="mt-4 flex flex-wrap justify-end gap-2">
    <Button variant="outlined" severity="secondary" disabled={!dirty || busy} onClick={reset}>{$t("exam.layout.discard")}</Button>
    <Button loading={busy} disabled={!dirty || busy} onClick={save}>{$t("common.save")}</Button>
  </div>
</Card>
