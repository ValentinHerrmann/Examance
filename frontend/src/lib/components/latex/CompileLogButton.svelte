<script lang="ts">
  /** "Show full log" for a failed LaTeX compile (issue #166): the engine's whole log with copy and download. */
  import { Button, Modal } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { faFileLines } from "@fortawesome/free-solid-svg-icons";

  interface Props {
    log: string;
    class?: string;
  }

  let { log, class: className = "" }: Props = $props();

  let open = $state(false);
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(log);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be refused; the log is on screen and downloadable anyway.
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
      <p class="m-0 text-sm text-muted">{$t("misc.compiler.logHint")}</p>
      <pre class="m-0 min-h-0 flex-1 overflow-auto rounded-md bg-surface-sunken p-3 text-xs whitespace-pre-wrap break-all">{log}</pre>
    </div>
    {#snippet footer()}
      <Button severity="secondary" onClick={copy}>
        {copied ? $t("misc.compiler.logCopied") : $t("misc.compiler.logCopy")}
      </Button>
      <Button severity="secondary" onClick={download}>{$t("misc.compiler.logDownload")}</Button>
      <Button onClick={() => (open = false)}>{$t("misc.compiler.logClose")}</Button>
    {/snippet}
  </Modal>
{/if}
