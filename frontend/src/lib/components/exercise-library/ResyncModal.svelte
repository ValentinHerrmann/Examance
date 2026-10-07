<script lang="ts">
  import { untrack } from "svelte";
  import type { ResyncPreview, ResyncVariant } from "#lib/api/exerciseSharing";
  import { resyncVariantLabel } from "#lib/exercise-library/groupExercises";
  import { t } from "#lib/i18n";
  import { Alert, Badge, Button, Checkbox, Modal, Spinner } from "#lib/components/ui";
  import MergeEditor from "./MergeEditor.svelte";

  /** Review what a resync takes over from the source; choose variants and edit the merge (issue #65). */
  interface Props {
    open?: boolean;
    /** Null while loading. */
    preview?: ResyncPreview | null;
    busy?: boolean;
    error?: string;
    /** Reloads the preview after a failed load. */
    onRetry?: () => void;
    /** `selected`: source row ids to take over; `overrides`: hand-merged LaTeX by source row id. */
    onApply: (selected: Set<string>, overrides: Record<string, string>) => void;
    onClose: () => void;
  }

  let { open = false, preview = null, busy = false, error = "", onRetry, onApply, onClose }: Props = $props();

  // Local edit buffers, reset whenever a new preview arrives.
  let chosen: Record<string, boolean> = $state({});
  let merged: Record<string, string> = $state({});

  let applicable = $derived(preview?.variants.filter((v) => (v.kind === "changed" || v.kind === "new") && v.sourceExerciseId) ?? []);
  let selectedCount = $derived(applicable.filter((v) => chosen[v.sourceExerciseId!]).length);
  let locallyModified = $derived(preview?.variants.some((v) => v.locallyModified && v.kind === "changed") ?? false);

  const kindKey = {
    changed: "exercises.sharing.resyncModal.kindChanged",
    new: "exercises.sharing.resyncModal.kindNew",
    removed: "exercises.sharing.resyncModal.kindRemoved",
    unchanged: "exercises.sharing.resyncModal.kindUnchanged",
    local: "exercises.sharing.resyncModal.kindLocal",
  } as const;

  const kindSeverity = { changed: "warning", new: "info", removed: "secondary", unchanged: "success", local: "secondary" } as const;

  const variantLabel = (v: ResyncVariant) => resyncVariantLabel(v, "source");

  function apply() {
    const selected = new Set(applicable.filter((v) => chosen[v.sourceExerciseId!]).map((v) => v.sourceExerciseId!));
    const overrides: Record<string, string> = {};
    for (const v of applicable) {
      const id = v.sourceExerciseId!;
      if (selected.has(id) && merged[id] !== undefined && merged[id] !== (v.source?.latexBody ?? "")) overrides[id] = merged[id];
    }
    onApply(selected, overrides);
  }

  $effect.pre(() => {
    const p = preview;
    untrack(() => resetBuffers(p));
  });

  function resetBuffers(p: ResyncPreview | null) {
    const nextChosen: Record<string, boolean> = {};
    const nextMerged: Record<string, string> = {};
    for (const v of p?.variants ?? []) {
      if ((v.kind === "changed" || v.kind === "new") && v.sourceExerciseId) {
        nextChosen[v.sourceExerciseId] = true;
        nextMerged[v.sourceExerciseId] = v.source?.latexBody ?? "";
      }
    }
    chosen = nextChosen;
    merged = nextMerged;
  }
</script>

{#snippet retry()}
  <Button size="sm" variant="outlined" severity="secondary" onClick={onRetry}>{$t("common.retry")}</Button>
{/snippet}

<Modal {open} size="large" title={$t("exercises.sharing.resyncModal.title")} {onClose} {error} errorActions={!preview && onRetry ? retry : undefined}>
  {#if !preview && !error}
    <div class="flex items-center gap-2 p-6 text-muted"><Spinner /> {$t("exercises.sharing.resyncModal.loading")}</div>
  {:else if preview}
    <div class="flex flex-col gap-3">
      <p class="m-0 text-content">{$t("exercises.sharing.resyncModal.intro")}</p>
      {#if locallyModified}
        <Alert severity="warning">{$t("exercises.sharing.resyncModal.locallyModified")}</Alert>
      {/if}
      {#if applicable.length === 0}
        <Alert severity="info">{$t("exercises.sharing.resyncModal.nothing")}</Alert>
      {/if}
      {#each preview.variants as v, i (v.sourceExerciseId ?? v.own?.id ?? i)}
        {@const sid = v.sourceExerciseId}
        <section class="rounded-md border border-line p-3">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            {#if (v.kind === "changed" || v.kind === "new") && sid}
              <Checkbox bind:checked={chosen[sid]} label={variantLabel(v)} />
            {:else}
              <span class="font-semibold text-content">{variantLabel(v)}</span>
            {/if}
            <Badge severity={kindSeverity[v.kind]}>{$t(kindKey[v.kind])}</Badge>
            {#if v.kind === "changed" && v.own && v.source && v.own.maxPoints !== v.source.maxPoints}
              <Badge>{$t("exercises.sharing.resyncModal.points", { own: v.own.maxPoints, source: v.source.maxPoints })}</Badge>
            {/if}
          </div>
          {#if (v.kind === "changed" || v.kind === "new") && sid && chosen[sid]}
            <MergeEditor
              mine={v.own?.latexBody ?? ""}
              theirs={v.source?.latexBody ?? ""}
              bind:value={merged[sid]}
              mineLabel={$t("exercises.sharing.resyncModal.own")}
              theirsLabel={$t("exercises.sharing.resyncModal.source")}
            />
          {/if}
        </section>
      {/each}
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button loading={busy} disabled={!preview || selectedCount === 0} onClick={apply}>
      {$t("exercises.sharing.resyncModal.applySelected", { count: selectedCount })}
    </Button>
  {/snippet}
</Modal>
