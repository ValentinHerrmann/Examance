<script lang="ts">
  import type { ResyncPreview, ResyncVariant } from "#lib/api/exerciseSharing";
  import { computeSideBySideDiff, type DiffLine } from "#lib/latex/diff";
  import { t } from "#lib/i18n";
  import { Alert, Badge, Button, Modal, Spinner } from "#lib/components/ui";

  /** Review what a resync takes over from the source, then apply it (issue #65). Read-only diff. */
  interface Props {
    open?: boolean;
    /** Null while loading. */
    preview?: ResyncPreview | null;
    busy?: boolean;
    error?: string;
    onApply: () => void;
    onClose: () => void;
  }

  let { open = false, preview = null, busy = false, error = "", onApply, onClose }: Props = $props();

  let applicable = $derived(preview?.variants.filter((v) => v.kind === "changed" || v.kind === "new") ?? []);
  let locallyModified = $derived(preview?.variants.some((v) => v.locallyModified && v.kind === "changed") ?? false);

  const kindKey = {
    changed: "exercises.sharing.resyncModal.kindChanged",
    new: "exercises.sharing.resyncModal.kindNew",
    removed: "exercises.sharing.resyncModal.kindRemoved",
    unchanged: "exercises.sharing.resyncModal.kindUnchanged",
  } as const;

  const kindSeverity = { changed: "warning", new: "info", removed: "secondary", unchanged: "success" } as const;

  const lineClass: Record<DiffLine["type"], string> = {
    added: "bg-success/15",
    removed: "bg-danger/15",
    modified: "bg-warning/15",
    unchanged: "",
    empty: "bg-surface-sunken",
  };

  function variantLabel(v: ResyncVariant): string {
    const key = v.source?.variantKey || v.own?.variantKey;
    return key ? $t("exercises.sharing.resyncModal.variant", { key }) : (v.source?.name || v.own?.name || "");
  }
</script>

<Modal {open} size="large" title={$t("exercises.sharing.resyncModal.title")} {onClose}>
  {#if error}
    <div class="mb-3"><Alert severity="danger">{error}</Alert></div>
  {/if}
  {#if !preview}
    <div class="flex items-center gap-2 p-6 text-muted"><Spinner /> {$t("exercises.sharing.resyncModal.loading")}</div>
  {:else}
    <div class="flex flex-col gap-3">
      <p class="m-0 text-content">{$t("exercises.sharing.resyncModal.intro")}</p>
      {#if locallyModified}
        <Alert severity="warning">{$t("exercises.sharing.resyncModal.locallyModified")}</Alert>
      {/if}
      {#if applicable.length === 0}
        <Alert severity="info">{$t("exercises.sharing.resyncModal.nothing")}</Alert>
      {/if}
      {#each preview.variants as v, i (v.sourceExerciseId ?? v.own?.id ?? i)}
        <section class="rounded-md border border-line p-3">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="font-semibold text-content">{variantLabel(v)}</span>
            <Badge severity={kindSeverity[v.kind]}>{$t(kindKey[v.kind])}</Badge>
            {#if v.kind === "changed" && v.own && v.source && v.own.maxPoints !== v.source.maxPoints}
              <Badge>{$t("exercises.sharing.resyncModal.points", { own: v.own.maxPoints, source: v.source.maxPoints })}</Badge>
            {/if}
          </div>
          {#if v.kind === "changed" || v.kind === "new"}
            {@const diff = computeSideBySideDiff(v.own?.latexBody ?? "", v.source?.latexBody ?? "")}
            <div class="overflow-x-auto rounded-md border border-line">
              <div class="grid min-w-[36rem] grid-cols-2 font-mono text-xs">
                <div class="border-b border-r border-line bg-surface-sunken px-2 py-1 font-sans font-semibold text-muted">{$t("exercises.sharing.resyncModal.own")}</div>
                <div class="border-b border-line bg-surface-sunken px-2 py-1 font-sans font-semibold text-muted">{$t("exercises.sharing.resyncModal.source")}</div>
                {#each diff.leftLines as left, row (row)}
                  {@const right = diff.rightLines[row]}
                  <div class="min-w-0 whitespace-pre-wrap break-words border-r border-line px-2 py-0.5 text-content {lineClass[left.type]}">{left.text ?? ""}</div>
                  <div class="min-w-0 whitespace-pre-wrap break-words px-2 py-0.5 text-content {right ? lineClass[right.type] : ''}">{right?.text ?? ""}</div>
                {/each}
              </div>
            </div>
          {/if}
        </section>
      {/each}
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button loading={busy} disabled={!preview || applicable.length === 0} onClick={onApply}>{$t("exercises.sharing.resyncModal.apply")}</Button>
  {/snippet}
</Modal>
