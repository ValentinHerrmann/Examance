<script lang="ts">
  /**
   * "Show full log" for a failed LaTeX compile (issue #166): the engine's whole log with copy and download,
   * typical causes and a prompt for an external AI chat (issue #168; source only on request).
   */
  import { Button, Checkbox, Modal } from "#lib/components/ui";
  import { t, tOptional } from "#lib/i18n";
  import { loadLatexAssets } from "#lib/latex/assets";
  import type { CompileFailure } from "#lib/latex/compileError";
  import { buildAiPrompt, explainTexErrors } from "#lib/latex/errorHelp";
  import { faFileLines } from "@fortawesome/free-solid-svg-icons";

  interface Props {
    /** From `compileFailure(err)`; its source goes into the AI prompt only on request. */
    failure: CompileFailure;
    class?: string;
  }

  let { failure, class: className = "" }: Props = $props();
  const { log, source, engine } = $derived(failure);

  let open = $state(false);
  let copied = $state(false);
  let promptCopied = $state(false);
  let promptFailed = $state(false);
  let includeSource = $state(false);

  const causes = $derived(explainTexErrors(log));

  async function copy() {
    try {
      await navigator.clipboard.writeText(log);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be refused; the log is on screen and downloadable anyway.
    }
  }

  async function copyPrompt() {
    promptFailed = false;
    // Without the assets the prompt still has the errors; the template macros are a bonus.
    const assets = await loadLatexAssets().catch(() => null);
    const prompt = buildAiPrompt({ log, engine, source, includeSource, assets });
    try {
      await navigator.clipboard.writeText(prompt);
      promptCopied = true;
      setTimeout(() => (promptCopied = false), 2000);
    } catch {
      promptFailed = true;
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([log], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "latex-compile.log";
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<Button variant="outlined" severity="danger" size="sm" icon={faFileLines} class={className} onClick={() => (open = true)}>
  {$t("misc.compiler.showLog")}
</Button>

{#if open}
  <Modal open={true} size="large" tall title={$t("misc.compiler.logTitle")} closeOnBackdrop onClose={() => (open = false)}>
    <div class="flex min-h-0 flex-col gap-3">
      {#if causes.length > 0}
        <section class="rounded-md border border-line bg-surface-sunken p-3 text-sm">
          <h3 class="m-0 mb-1 text-sm font-semibold">{$t("misc.compiler.causesTitle")}</h3>
          <ul class="m-0 flex list-disc flex-col gap-1 pl-5">
            {#each causes as cause (cause.id)}
              <li>{$tOptional(`misc.compiler.cause.${cause.id}`, { detail: cause.detail ? ` (${cause.detail})` : "" })}</li>
            {/each}
          </ul>
        </section>
      {/if}
      <p class="m-0 text-sm text-muted">{$t("misc.compiler.logHint")}</p>
      <pre class="m-0 min-h-0 flex-1 overflow-auto rounded-md bg-surface-sunken p-3 text-xs whitespace-pre-wrap break-all">{log}</pre>
      <div class="flex flex-col gap-1 text-sm">
        <p class="m-0 text-muted">{$t("misc.compiler.causesMore")} {$t("misc.compiler.aiNotice")}</p>
        {#if source}
          <Checkbox bind:checked={includeSource} label={$t("misc.compiler.aiIncludeSource")} />
        {/if}
        {#if promptFailed}
          <p class="m-0 text-danger-fg">{$t("misc.compiler.aiFailed")}</p>
        {/if}
      </div>
    </div>
    {#snippet footer()}
      <Button severity="secondary" onClick={copyPrompt}>
        {promptCopied ? $t("misc.compiler.aiCopied") : $t("misc.compiler.aiCopy")}
      </Button>
      <Button severity="secondary" onClick={copy}>
        {copied ? $t("misc.compiler.logCopied") : $t("misc.compiler.logCopy")}
      </Button>
      <Button severity="secondary" onClick={download}>{$t("misc.compiler.logDownload")}</Button>
      <Button onClick={() => (open = false)}>{$t("misc.compiler.logClose")}</Button>
    {/snippet}
  </Modal>
{/if}
