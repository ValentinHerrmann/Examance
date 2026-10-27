<script lang="ts">
  /** Shown under every compile error (issues #166, #168): the likely cause, AI-chat help and the full log. */
  import { Button } from "#lib/components/ui";
  import { t, tOptional } from "#lib/i18n";
  import type { CompileFailure } from "#lib/latex/compileError";
  import { explainTexErrors } from "#lib/latex/errorHelp";
  import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
  import AiPromptDialog from "./AiPromptDialog.svelte";
  import CompileLogButton from "./CompileLogButton.svelte";

  interface Props {
    failure: CompileFailure;
    class?: string;
  }

  let { failure, class: className = "" }: Props = $props();

  let aiOpen = $state(false);
  const causes = $derived(explainTexErrors(failure.log));
</script>

<div class="flex flex-col gap-2 {className}">
  {#if causes.length > 0}
    <div class="text-sm">
      <strong>{$t("misc.compiler.causesTitle")}:</strong>
      {#if causes.length === 1}
        {$tOptional(`misc.compiler.cause.${causes[0].id}`, { detail: causes[0].detail ? ` (${causes[0].detail})` : "" })}
      {:else}
        <ul class="m-0 mt-1 flex list-disc flex-col gap-1 pl-5">
          {#each causes as cause (cause.id)}
            <li>{$tOptional(`misc.compiler.cause.${cause.id}`, { detail: cause.detail ? ` (${cause.detail})` : "" })}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
  <div class="flex flex-wrap gap-2">
    <Button severity="danger" size="sm" icon={faWandMagicSparkles} onClick={() => (aiOpen = true)}>
      {$t("misc.compiler.aiButton")}
    </Button>
    <CompileLogButton log={failure.log} />
  </div>
</div>

{#if aiOpen}
  <AiPromptDialog {failure} onClose={() => (aiOpen = false)} />
{/if}
