<script lang="ts">
  /**
   * The AI-chat prompt for writing or changing an exercise (issue #168): the teacher's request plus Examance context.
   * Clipboard only; the current code goes in only while its box is ticked.
   */
  import { Button, Checkbox, Field, Modal, Textarea } from "#lib/components/ui";
  import { locale, t } from "#lib/i18n";
  import { loadLatexAssets } from "#lib/latex/assets";
  import { buildExercisePrompt, type ExercisePromptInput } from "#lib/latex/exercisePrompt";
  import { preloadedPackages } from "#lib/latex/llmContext";
  import type { LatexPackageEntry } from "#lib/latex/packages";
  import { getAccountPackages } from "#lib/latex/packageSettings";
  import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
  import { effectiveLatexStore } from "#lib/stores/capabilities";
  import { onMount } from "svelte";
  import PromptPreview from "#lib/components/latex/PromptPreview.svelte";

  interface Props {
    latexBody: string;
    meta: ExercisePromptInput["meta"];
    questionType: ExercisePromptInput["questionType"];
    /** The editor's resource staging id; only file names are read. */
    resourceStagingId: string;
    /** Kept by the editor, so the request survives closing the dialog. */
    task?: string;
    onClose: () => void;
  }

  let { latexBody, meta, questionType, resourceStagingId, task = $bindable(""), onClose }: Props = $props();

  let includeCode = $state(true);
  let preloaded = $state.raw<string[]>([]);
  let accountPackages = $state.raw<LatexPackageEntry[]>([]);
  let resourceNames = $state.raw<string[]>([]);
  let copied = $state(false);
  let copyFailed = $state(false);

  const hasCode = $derived(latexBody.trim().length > 0);
  const prompt = $derived(
    buildExercisePrompt({
      task,
      latexBody,
      includeCode: hasCode && includeCode,
      meta,
      questionType,
      resourceNames,
      accountPackages,
      preloaded,
      engine: $effectiveLatexStore,
      locale: $locale,
    })
  );

  onMount(() => {
    // Each part is optional context: the prompt works without it.
    loadLatexAssets().then((assets) => {
      const sty = assets.find((a) => a.path === "sty/packages.sty");
      if (sty) preloaded = preloadedPackages(new TextDecoder().decode(sty.content));
    }, () => {});
    getAccountPackages().then((entries) => (accountPackages = entries), () => {});
    if (resourceStagingId) {
      exerciseResourceRepository.listLocal(resourceStagingId).then((rows) => (resourceNames = rows.map((r) => r.filename)), () => {});
    }
  });

  async function copy() {
    copyFailed = false;
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copyFailed = true;
    }
  }
</script>

<Modal open={true} size="large" tall title={$t("exercises.aiPrompt.title")} {onClose}>
  <div class="flex min-h-0 flex-col gap-3">
    <p class="m-0 text-sm">{$t("exercises.aiPrompt.intro")}</p>
    <Field label={$t("exercises.aiPrompt.taskLabel")} forId="exercise-ai-task">
      <Textarea id="exercise-ai-task" bind:value={task} rows={3} placeholder={$t("exercises.aiPrompt.taskPlaceholder")} />
    </Field>
    {#if hasCode}
      <Checkbox bind:checked={includeCode} label={$t("exercises.aiPrompt.includeCode")} />
    {/if}
    <p class="m-0 text-sm text-muted">{$t("exercises.aiPrompt.notice")}</p>
    <p class="m-0 text-sm text-muted">
      {questionType === "mc" ? $t("exercises.aiPrompt.pasteHintMc") : $t("exercises.aiPrompt.pasteHint")}
    </p>
    {#if copyFailed}
      <p class="m-0 text-sm text-danger-fg">{$t("exercises.aiPrompt.copyFailed")}</p>
    {/if}
    <h3 class="m-0 text-sm font-semibold">{$t("exercises.aiPrompt.preview")}</h3>
    <PromptPreview text={prompt} class="min-h-32 flex-1" />
  </div>
  {#snippet footer()}
    <Button onClick={copy} disabled={!task.trim()}>{copied ? $t("exercises.aiPrompt.copied") : $t("exercises.aiPrompt.copy")}</Button>
    <Button severity="secondary" onClick={onClose}>{$t("misc.compiler.logClose")}</Button>
  {/snippet}
</Modal>
