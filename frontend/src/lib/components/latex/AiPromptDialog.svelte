<script lang="ts">
  /** The AI-chat prompt for a failed compile (issue #168), shown before copying. Clipboard only; the exercise code goes in only on the user's tick (exam content). */
  import { Button, Checkbox, Modal } from "#lib/components/ui";
  import { locale, t } from "#lib/i18n";
  import { loadLatexAssets, type LatexAsset } from "#lib/latex/assets";
  import type { CompileFailure } from "#lib/latex/compileError";
  import { buildAiPrompt } from "#lib/latex/errorHelp";
  import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
  import { createCopyState } from "#lib/utils/copyState.svelte";
  import { onMount } from "svelte";
  import PromptPreview from "./PromptPreview.svelte";

  interface Props {
    failure: CompileFailure;
    onClose: () => void;
  }

  let { failure, onClose }: Props = $props();

  let includeSource = $state(false);
  let assets = $state.raw<LatexAsset[] | null>(null);
  let resourceNames = $state.raw<string[] | null>(null);
  const clipboard = createCopyState();

  const prompt = $derived(
    buildAiPrompt({
      log: failure.log,
      engine: failure.engine,
      source: failure.source,
      ranges: failure.ranges,
      includeSource,
      assets,
      locale: $locale,
      resourceNames,
    })
  );

  onMount(() => {
    // Without the assets the prompt still holds the errors; the template definitions are a bonus.
    loadLatexAssets().then(
      (loaded) => (assets = loaded),
      () => {}
    );
    // Files the server loaded itself are known by exercise id only; their names come from the repository.
    const { names, exerciseIds } = failure.files;
    Promise.all(exerciseIds.map((id) => exerciseResourceRepository.listNames(id))).then(
      (lists) => (resourceNames = [...new Set([...names, ...lists.flat()])].sort((a, b) => a.localeCompare(b))),
      () => (resourceNames = [...names])
    );
  });
</script>

<Modal open={true} size="large" tall title={$t("misc.compiler.aiTitle")} closeOnBackdrop {onClose}>
  <div class="flex min-h-0 flex-col gap-3">
    <p class="m-0 text-sm">{$t("misc.compiler.aiIntro")}</p>
    {#if failure.source}
      <div class="flex flex-col gap-1 rounded-md border border-line bg-surface-sunken p-3">
        <Checkbox bind:checked={includeSource} label={$t("misc.compiler.aiIncludeSource")} />
        <p class="m-0 text-sm text-muted">{$t("misc.compiler.aiIncludeSourceHint")}</p>
      </div>
    {/if}
    <p class="m-0 text-sm text-muted">{$t("misc.compiler.aiNotice")}</p>
    {#if clipboard.failed}
      <p class="m-0 text-sm text-danger-fg">{$t("misc.compiler.aiFailed")}</p>
    {/if}
    <h3 class="m-0 text-sm font-semibold">{$t("misc.compiler.aiPreview")}</h3>
    <PromptPreview text={prompt} class="flex-1" />
  </div>
  {#snippet footer()}
    <Button onClick={() => clipboard.copy(prompt)}>{clipboard.copied ? $t("misc.compiler.aiCopied") : $t("misc.compiler.aiCopy")}</Button>
    <Button severity="secondary" onClick={onClose}>{$t("misc.compiler.logClose")}</Button>
  {/snippet}
</Modal>
