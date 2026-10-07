<script lang="ts">
  import { untrack } from "svelte";
  import type { ResyncPreview, ResyncVariant } from "#lib/api/exerciseSharing";
  import { t } from "#lib/i18n";
  import { resyncVariantLabel } from "#lib/exercise-library/groupExercises";
  import { Alert, Badge, Button, Checkbox, Modal, Spinner, Textarea } from "#lib/components/ui";
  import LatexSideBySideDiff from "./LatexSideBySideDiff.svelte";

  /** Propose changes of a linked copy to the original's author (issue #65). */
  interface Props {
    open?: boolean;
    /** The copy's resync preview (null while loading); it tells which variants can be proposed. */
    preview?: ResyncPreview | null;
    email?: string;
    busy?: boolean;
    error?: string;
    /** Reloads the preview after a failed load. */
    onRetry?: () => void;
    onSubmit: (exerciseIds: string[], message: string) => void;
    onClose: () => void;
  }

  let { open = false, preview = null, email = "", busy = false, error = "", onRetry, onSubmit, onClose }: Props = $props();

  let chosen: Record<string, boolean> = $state({});
  let message = $state("");

  /** Changed in the copy (proposed as a new version) or added to it (proposed as a new variant). */
  function contributable(v: ResyncVariant): boolean {
    if (!v.own) return false;
    return v.kind === "local" || (!!v.source && v.locallyModified && (v.kind === "changed" || v.kind === "unchanged"));
  }

  let candidates = $derived(preview?.variants.filter(contributable) ?? []);
  let selectedIds = $derived(candidates.filter((v) => chosen[v.own!.id]).map((v) => v.own!.id));

  const label = (v: ResyncVariant) => resyncVariantLabel(v, "own");

  function resetBuffers(p: ResyncPreview | null) {
    const next: Record<string, boolean> = {};
    for (const v of p?.variants ?? []) if (contributable(v)) next[v.own!.id] = true;
    chosen = next;
    message = "";
  }

  $effect.pre(() => {
    const p = preview;
    untrack(() => resetBuffers(p));
  });
</script>

{#snippet retry()}
  <Button size="sm" variant="outlined" severity="secondary" onClick={onRetry}>{$t("common.retry")}</Button>
{/snippet}

<Modal {open} size="large" title={$t("exercises.contributions.contributeModal.title")} {onClose} {error} errorActions={!preview && onRetry ? retry : undefined}>
  {#if !preview && !error}
    <div class="flex items-center gap-2 p-6 text-muted"><Spinner /> {$t("exercises.sharing.resyncModal.loading")}</div>
  {:else if preview}
    <div class="flex flex-col gap-3">
      <p class="m-0 text-content">{$t("exercises.contributions.contributeModal.intro")}</p>
      <Alert severity="warning">{$t("exercises.contributions.contributeModal.email", { email })}</Alert>
      {#if candidates.length === 0}
        <Alert severity="info">{$t("exercises.contributions.contributeModal.nothing")}</Alert>
      {/if}
      {#each candidates as v (v.own!.id)}
        <section class="rounded-md border border-line p-3">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <Checkbox bind:checked={chosen[v.own!.id]} label={label(v)} />
            <Badge severity={v.kind === "local" ? "info" : "warning"}>
              {v.kind === "local" ? $t("exercises.contributions.kindVariant") : $t("exercises.contributions.kindVersion")}
            </Badge>
          </div>
          <LatexSideBySideDiff
            left={v.source?.latexBody ?? ""}
            right={v.own?.latexBody ?? ""}
            leftLabel={$t("exercises.contributions.original")}
            rightLabel={$t("exercises.contributions.yourCopy")}
          />
        </section>
      {/each}
      {#if candidates.length > 0}
        <label class="flex flex-col gap-1 text-sm text-muted">
          {$t("exercises.contributions.contributeModal.message")}
          <Textarea bind:value={message} rows={3} maxlength={1000} />
        </label>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button loading={busy} disabled={selectedIds.length === 0} onClick={() => onSubmit(selectedIds, message)}>
      {$t("exercises.contributions.contributeModal.submit")}
    </Button>
  {/snippet}
</Modal>
