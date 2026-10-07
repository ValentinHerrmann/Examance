<script lang="ts">
  import { untrack } from "svelte";
  import type { ContributionDetail } from "#lib/api/exerciseContributions";
  import { t } from "#lib/i18n";
  import { Alert, Badge, Button, Modal, Spinner, TextInput, Textarea } from "#lib/components/ui";
  import MergeEditor from "./MergeEditor.svelte";

  /** The author reviews a proposal, may edit it, then accepts or rejects it (issue #65). */
  interface Props {
    open?: boolean;
    /** Null while loading. */
    detail?: ContributionDetail | null;
    busy?: boolean;
    error?: string;
    onAccept: (opts: { latexBody?: string; asVariant: boolean; variantKey?: string }) => void;
    onReject: (note: string) => void;
    onClose: () => void;
  }

  let { open = false, detail = null, busy = false, error = "", onAccept, onReject, onClose }: Props = $props();

  let result = $state("");
  let variantKey = $state("");
  let note = $state("");
  let rejecting = $state(false);

  let pending = $derived(detail?.status === "pending");
  let asVariant = $derived(detail?.kind === "variant" || !!detail?.targetGone);

  const fileSeverity = { added: "success", removed: "danger", changed: "warning", unchanged: "secondary" } as const;
  const fileKey = {
    added: "exercises.contributions.fileAdded",
    removed: "exercises.contributions.fileRemoved",
    changed: "exercises.contributions.fileChanged",
    unchanged: "exercises.contributions.fileUnchanged",
  } as const;

  function accept() {
    if (!detail) return;
    const edited = result !== (detail.latexBody ?? "");
    onAccept({
      latexBody: edited ? result : undefined,
      asVariant: detail.kind === "version" && detail.targetGone,
      variantKey: asVariant ? variantKey.trim() || undefined : undefined,
    });
  }

  function resetBuffers(d: ContributionDetail | null) {
    result = d?.latexBody ?? "";
    variantKey = d?.variantKey ?? "";
    note = "";
    rejecting = false;
  }

  $effect.pre(() => {
    const d = detail;
    untrack(() => resetBuffers(d));
  });
</script>

<Modal {open} size="large" title={$t("exercises.contributions.reviewModal.title")} {onClose}>
  {#if error}
    <div class="mb-3"><Alert severity="danger">{error}</Alert></div>
  {/if}
  {#if !detail}
    <div class="flex items-center gap-2 p-6 text-muted"><Spinner /> {$t("exercises.sharing.resyncModal.loading")}</div>
  {:else}
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-semibold text-content">{detail.exerciseName || $t("exercises.untitled")}</span>
        <Badge severity={detail.kind === "variant" ? "info" : "warning"}>
          {detail.kind === "variant" ? $t("exercises.contributions.kindVariant") : $t("exercises.contributions.kindVersion")}
        </Badge>
        {#if detail.variantKey}
          <Badge>{$t("exercises.sharing.resyncModal.variant", { key: detail.variantKey })}</Badge>
        {/if}
      </div>
      <p class="m-0 text-sm text-muted">{$t("exercises.contributions.from", { email: detail.counterpartEmail ?? "" })}</p>
      {#if detail.message}
        <blockquote class="m-0 rounded-md border-l-4 border-line bg-surface-sunken px-3 py-2 text-content">{detail.message}</blockquote>
      {/if}
      {#if !pending}
        <Alert severity="info">{$t("exercises.contributions.alreadyDecided")}</Alert>
      {:else}
        <p class="m-0 text-content">{$t("exercises.contributions.reviewModal.intro")}</p>
        {#if detail.targetGone}
          <Alert severity="warning">{$t("exercises.contributions.targetGone")}</Alert>
        {:else if detail.stale}
          <Alert severity="warning">{$t("exercises.contributions.stale")}</Alert>
        {/if}
        <MergeEditor
          mine={asVariant ? "" : (detail.base?.latexBody ?? "")}
          theirs={detail.latexBody ?? ""}
          bind:value={result}
          mineLabel={$t("exercises.contributions.currentVersion")}
          theirsLabel={$t("exercises.contributions.proposal")}
        />
        {#if asVariant}
          <label class="flex flex-col gap-1 text-sm text-muted">
            {$t("exercises.contributions.reviewModal.variantKey")}
            <TextInput bind:value={variantKey} size="sm" />
          </label>
        {/if}
        {#if detail.files.length > 0}
          <div class="flex flex-col gap-1">
            <span class="text-sm font-semibold text-muted">{$t("exercises.contributions.files")}</span>
            <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
              {#each detail.files as f (f.filename)}
                <li class="flex items-center gap-1 text-sm text-content">
                  <span class="font-mono">{f.filename}</span>
                  <Badge severity={fileSeverity[f.change]}>{$t(fileKey[f.change])}</Badge>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if rejecting}
          <label class="flex flex-col gap-1 text-sm text-muted">
            {$t("exercises.contributions.reviewModal.rejectNote")}
            <Textarea bind:value={note} rows={2} maxlength={1000} />
          </label>
        {/if}
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    {#if detail && pending}
      {#if rejecting}
        <Button severity="danger" loading={busy} onClick={() => onReject(note)}>{$t("exercises.contributions.reviewModal.confirmReject")}</Button>
      {:else}
        <Button variant="outlined" severity="danger" disabled={busy} onClick={() => (rejecting = true)}>{$t("exercises.contributions.reviewModal.reject")}</Button>
        <Button loading={busy} onClick={accept}>
          {asVariant ? $t("exercises.contributions.reviewModal.acceptVariant") : $t("exercises.contributions.reviewModal.acceptVersion")}
        </Button>
      {/if}
    {/if}
  {/snippet}
</Modal>
