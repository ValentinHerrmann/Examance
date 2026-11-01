<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import { Badge, Button, Icon, TextInput } from "#lib/components/ui";
  import type { ExerciseResourceRecord } from "#lib/db/schema";
  import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
  import {
    MAX_EXERCISE_RESOURCE_BYTES,
    ResourceError,
    formatBytes,
    guessMimeType,
    insertSnippetFor,
    sanitizeResourceName,
    validateResource,
  } from "#lib/latex/resources";

  interface Props {
    /** Staging id (not the exercise id), so files can be attached before the exercise exists; committed on save. */
    exerciseId: string;
    /** False while the staging area is still being filled; the list loads once it turns true. */
    seeded?: boolean;
    /** Called with the LaTeX snippet that references the clicked file. */
    onInsert?: (snippet: string) => void;
    /** Called after any change, so the parent can refresh a preview. */
    onChange?: () => void;
  }

  let { exerciseId, seeded = true, onInsert = () => {}, onChange = () => {} }: Props = $props();

  // Folded by default: the files are rarely needed and the code editor gets the space.
  let open = $state(false);
  let resources: ExerciseResourceRecord[] = $state.raw([]);
  let thumbnails: Record<string, string> = $state.raw({});
  let errorMsg = $state("");
  let busy = $state(false);
  let dragOver = $state(false);
  let renamingId: string | null = $state(null);
  let renameValue = $state("");
  let fileInput: HTMLInputElement | undefined = $state();

  let usedBytes = $derived(resources.reduce((sum, r) => sum + r.byteSize, 0));
  let usedPercent = $derived(Math.min(100, Math.round((usedBytes / MAX_EXERCISE_RESOURCE_BYTES) * 100)));

  let loadedFor = "";

  async function load() {
    try {
      resources = await exerciseResourceRepository.listLocal(exerciseId);
      await buildThumbnails();
    } catch (err: any) {
      errorMsg = err?.message || translate("editor.resources.loadFailed");
    }
  }

  // Only files whose bytes are already local get a thumbnail; server-seeded rows carry metadata only, and downloading every figure for a 36px square would be expensive.
  async function buildThumbnails() {
    const key = get(sessionStore).sessionKey;
    for (const res of resources) {
      if (thumbnails[res.id] || !res.mimeType.startsWith("image/")) continue;
      if (!res.dataCt && !res.data) continue;
      try {
        const bytes = await exerciseResourceRepository.getBytes(res, key);
        const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: res.mimeType }));
        thumbnails = { ...thumbnails, [res.id]: url };
      } catch {
        // A locked session just means no thumbnail.
      }
    }
  }

  function revokeThumbnails() {
    for (const url of Object.values(thumbnails)) URL.revokeObjectURL(url);
    thumbnails = {};
  }

  onDestroy(revokeThumbnails);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    busy = true;
    errorMsg = "";
    const key = get(sessionStore).sessionKey;

    // Tracked across the batch: the reactive `usedBytes` only catches up after the reload below, which would let one drop overshoot the limit.
    let pending = usedBytes;

    try {
      for (const file of Array.from(files)) {
        try {
          const filename = await validateResource(file, pending);
          pending += file.size;
          const bytes = new Uint8Array(await file.arrayBuffer());
          await exerciseResourceRepository.stage(
            exerciseId,
            filename,
            guessMimeType(filename, file.type),
            bytes,
            key
          );
        } catch (err: any) {
          // Report the first rejection and keep the rest of the batch going.
          errorMsg = err instanceof ResourceError ? err.message : err?.message || translate("editor.resources.uploadFailed");
        }
      }
      revokeThumbnails();
      await load();
      onChange();
    } finally {
      busy = false;
      if (fileInput) fileInput.value = "";
    }
  }

  function handlePicked(event: Event) {
    void handleFiles((event.currentTarget as HTMLInputElement).files);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    void handleFiles(event.dataTransfer?.files ?? null);
  }

  async function handleDelete(res: ExerciseResourceRecord) {
    if (!window.confirm(`${translate("editor.resources.confirmDelete", { name: res.filename })}\n\n${translate("common.trashHint", { days: TRASH_DAYS })}`)) {
      return;
    }
    await exerciseResourceRepository.remove(res);
    revokeThumbnails();
    await load();
    onChange();
  }

  function startRename(res: ExerciseResourceRecord) {
    renamingId = res.id;
    renameValue = res.filename;
  }

  async function commitRename(res: ExerciseResourceRecord) {
    errorMsg = "";
    try {
      const filename = sanitizeResourceName(renameValue);
      if (filename !== res.filename) {
        if (resources.some((r) => r.id !== res.id && r.filename === filename)) {
          throw new ResourceError(translate("editor.resources.nameTaken", { name: filename }));
        }
        await exerciseResourceRepository.rename(res, filename);
        await load();
        onChange();
      }
      renamingId = null;
    } catch (err: any) {
      errorMsg = err?.message || translate("editor.resources.renameFailed");
    }
  }

  $effect.pre(() => {
    const id = exerciseId;
    const ready = seeded;
    if (id && ready && id !== loadedFor) {
      loadedFor = id;
      untrack(() => void load());
    }
  });
</script>

<div class="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2">
  <button type="button" class="flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent p-0 text-left pointer-coarse:min-h-11" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="flex items-center gap-2">
      <span class="text-sm font-semibold text-content">{$t("editor.resources.heading")}</span>
      <Badge size="xs">{resources.length}</Badge>
    </span>
    <Icon icon={open ? faChevronUp : faChevronDown} class="text-muted" />
    <span class="sr-only">{open ? $t("editor.resources.hide") : $t("editor.resources.show")}</span>
  </button>

  {#if open}
    <div class="flex items-baseline justify-end gap-2">
      <span class="text-xs text-muted" title={$t("editor.resources.usedTitle")}>
        {formatBytes(usedBytes)} / {formatBytes(MAX_EXERCISE_RESOURCE_BYTES)}
      </span>
    </div>
    <div class="h-1 overflow-hidden rounded-full bg-surface-inset">
      <div class="h-full bg-primary" style={`width:${usedPercent}%`}></div>
    </div>

    <div
      class="cursor-pointer rounded-md border border-dashed p-3 text-center text-sm {dragOver
        ? 'border-focus text-content'
        : 'border-line-strong text-muted'}"
      role="button"
      tabindex="0"
      ondragover={(e) => {
        e.preventDefault();
        dragOver = true;
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={handleDrop}
      onclick={() => fileInput?.click()}
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && fileInput?.click()}
    >
      {#if busy}
        {$t("editor.resources.storing")}
      {:else}
        {$t("editor.resources.dropzone")}
      {/if}
    </div>
    <input class="hidden" type="file" multiple bind:this={fileInput} onchange={handlePicked} />

    <p class="m-0 text-xs text-muted">
      {$t("editor.resources.hintLead")} <code class="text-content">\includegraphics{"{figure.png}"}</code>. {$t("editor.resources.hintTail")}
    </p>

    {#if errorMsg}
      <p class="m-0 text-xs text-danger-fg" role="alert">{errorMsg}</p>
    {/if}

    {#if resources.length > 0}
      <ul class="m-0 flex max-h-56 list-none flex-col gap-1.5 overflow-y-auto p-0">
        {#each resources as res (res.id)}
          <li class="flex items-center gap-2 rounded-md bg-surface-inset p-1.5">
            <div class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunken">
              {#if thumbnails[res.id]}
                <img class="size-full object-cover" src={thumbnails[res.id]} alt={res.filename} />
              {:else}
                <span class="text-xs font-bold text-muted">{(res.filename.split(".").pop() || "?").toUpperCase()}</span>
              {/if}
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              {#if renamingId === res.id}
                <TextInput size="sm" bind:value={renameValue} onkeydown={(e) => e.key === "Enter" && commitRename(res)} />
                <div class="mt-1 flex gap-1">
                  <Button size="sm" onClick={() => commitRename(res)}>{$t("editor.resources.save")}</Button>
                  <Button size="sm" variant="outlined" severity="secondary" onClick={() => (renamingId = null)}>{$t("editor.resources.cancel")}</Button>
                </div>
              {:else}
                <span class="truncate text-sm text-content" title={res.filename}>{res.filename}</span>
                <span class="text-xs text-muted">{formatBytes(res.byteSize)}</span>
              {/if}
            </div>
            <div class="flex shrink-0 flex-wrap justify-end gap-1">
              <Button size="sm" variant="outlined" severity="secondary" title={$t("editor.resources.insertTitle")} onClick={() => onInsert(insertSnippetFor(res.filename))}>{$t("editor.resources.insert")}</Button>
              <Button size="sm" variant="outlined" severity="secondary" title={$t("editor.resources.rename")} onClick={() => startRename(res)}>{$t("editor.resources.rename")}</Button>
              <Button size="sm" variant="outlined" severity="danger" title={$t("editor.resources.delete")} onClick={() => handleDelete(res)}>{$t("editor.resources.delete")}</Button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
