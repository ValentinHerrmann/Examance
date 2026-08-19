<script lang="ts">
  import { onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import type { ExerciseResourceRecord } from "$lib/db/schema";
  import { exerciseResourceRepository } from "$lib/repositories/exerciseResourceRepository";
  import {
    MAX_EXERCISE_RESOURCE_BYTES,
    ResourceError,
    formatBytes,
    guessMimeType,
    insertSnippetFor,
    sanitizeResourceName,
    validateResource,
  } from "$lib/latex/resources";

  /** Exercise the files belong to. Must be stable before the first upload. */
  export let exerciseId: string;
  /** Called with the LaTeX snippet that references the clicked file. */
  export let onInsert: (snippet: string) => void = () => {};
  /** Called after any change, so the parent can refresh a preview. */
  export let onChange: () => void = () => {};

  let resources: ExerciseResourceRecord[] = [];
  let thumbnails: Record<string, string> = {};
  let errorMsg = "";
  let busy = false;
  let dragOver = false;
  let renamingId: string | null = null;
  let renameValue = "";
  let fileInput: HTMLInputElement;

  $: usedBytes = resources.reduce((sum, r) => sum + r.byteSize, 0);
  $: usedPercent = Math.min(100, Math.round((usedBytes / MAX_EXERCISE_RESOURCE_BYTES) * 100));

  let loadedFor = "";
  $: if (exerciseId && exerciseId !== loadedFor) {
    loadedFor = exerciseId;
    void load();
  }

  async function load() {
    try {
      resources = await exerciseResourceRepository.list(exerciseId);
      await buildThumbnails();
    } catch (err: any) {
      errorMsg = err?.message || "Could not load resource files.";
    }
  }

  async function buildThumbnails() {
    const key = get(sessionStore).sessionKey;
    for (const res of resources) {
      if (thumbnails[res.id] || !res.mimeType.startsWith("image/")) continue;
      try {
        const bytes = await exerciseResourceRepository.getBytes(res, key);
        const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: res.mimeType }));
        thumbnails = { ...thumbnails, [res.id]: url };
      } catch {
        // A locked session or a missing server blob just means no thumbnail.
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

    // Tracked across the batch: the reactive `usedBytes` only catches up after
    // the reload below, which would let one drop overshoot the limit.
    let pending = usedBytes;

    try {
      for (const file of Array.from(files)) {
        try {
          const filename = await validateResource(file, pending);
          pending += file.size;
          const bytes = new Uint8Array(await file.arrayBuffer());
          await exerciseResourceRepository.save(
            exerciseId,
            crypto.randomUUID(),
            filename,
            guessMimeType(filename, file.type),
            bytes,
            key
          );
        } catch (err: any) {
          // Report the first rejection and keep the rest of the batch going.
          errorMsg = err instanceof ResourceError ? err.message : err?.message || "Upload failed.";
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
    if (!window.confirm(`Delete "${res.filename}"? References to it in the LaTeX source will stop resolving.`)) {
      return;
    }
    await exerciseResourceRepository.delete(res);
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
          throw new ResourceError(`"${filename}" is already used by another file of this exercise.`);
        }
        await exerciseResourceRepository.rename(res, filename);
        await load();
        onChange();
      }
      renamingId = null;
    } catch (err: any) {
      errorMsg = err?.message || "Rename failed.";
    }
  }
</script>

<div class="resource-panel">
  <div class="header">
    <span class="title">Resource files</span>
    <span class="usage" title="Used of the per-exercise limit">
      {formatBytes(usedBytes)} / {formatBytes(MAX_EXERCISE_RESOURCE_BYTES)}
    </span>
  </div>
  <div class="usage-bar"><div class="usage-fill" style={`width:${usedPercent}%`}></div></div>

  <div
    class="dropzone"
    class:drag-over={dragOver}
    role="button"
    tabindex="0"
    on:dragover|preventDefault={() => (dragOver = true)}
    on:dragleave={() => (dragOver = false)}
    on:drop={handleDrop}
    on:click={() => fileInput?.click()}
    on:keydown={(e) => (e.key === "Enter" || e.key === " ") && fileInput?.click()}
  >
    {#if busy}
      Storing files…
    {:else}
      Drop files here or click to choose — PNG, JPG, PDF and any other file the document needs.
    {/if}
  </div>
  <input
    class="hidden-input"
    type="file"
    multiple
    bind:this={fileInput}
    on:change={handlePicked}
  />

  <p class="hint">
    Reference a file by its name, e.g. <code>\includegraphics{"{figure.png}"}</code>. Do not upload
    files containing personal data of pupils.
  </p>

  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}

  {#if resources.length > 0}
    <ul class="list">
      {#each resources as res (res.id)}
        <li class="item">
          <div class="thumb">
            {#if thumbnails[res.id]}
              <img src={thumbnails[res.id]} alt={res.filename} />
            {:else}
              <span class="ext">{(res.filename.split(".").pop() || "?").toUpperCase()}</span>
            {/if}
          </div>
          <div class="meta">
            {#if renamingId === res.id}
              <input
                class="rename"
                bind:value={renameValue}
                on:keydown={(e) => e.key === "Enter" && commitRename(res)}
              />
              <div class="rename-actions">
                <button type="button" on:click={() => commitRename(res)}>Save</button>
                <button type="button" on:click={() => (renamingId = null)}>Cancel</button>
              </div>
            {:else}
              <span class="name" title={res.filename}>{res.filename}</span>
              <span class="size">{formatBytes(res.byteSize)}</span>
            {/if}
          </div>
          <div class="actions">
            <button type="button" title="Insert into the LaTeX source" on:click={() => onInsert(insertSnippetFor(res.filename))}>
              Insert
            </button>
            <button type="button" title="Rename" on:click={() => startRename(res)}>Rename</button>
            <button type="button" class="danger" title="Delete" on:click={() => handleDelete(res)}>Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .resource-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid rgb(51 65 85);
    border-radius: 0.5rem;
    background: rgb(15 23 42);
  }
  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .title {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgb(226 232 240);
  }
  .usage {
    font-size: 0.72rem;
    color: rgb(148 163 184);
  }
  .usage-bar {
    height: 3px;
    border-radius: 999px;
    background: rgb(30 41 59);
    overflow: hidden;
  }
  .usage-fill {
    height: 100%;
    background: rgb(56 189 248);
  }
  .dropzone {
    padding: 0.75rem;
    border: 1px dashed rgb(71 85 105);
    border-radius: 0.5rem;
    text-align: center;
    font-size: 0.78rem;
    color: rgb(148 163 184);
    cursor: pointer;
  }
  .dropzone.drag-over {
    border-color: rgb(56 189 248);
    color: rgb(226 232 240);
  }
  .hidden-input {
    display: none;
  }
  .hint {
    margin: 0;
    font-size: 0.72rem;
    color: rgb(100 116 139);
  }
  .hint code {
    color: rgb(148 163 184);
  }
  .error {
    margin: 0;
    font-size: 0.75rem;
    color: rgb(248 113 113);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 14rem;
    overflow-y: auto;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem;
    border-radius: 0.375rem;
    background: rgb(30 41 59);
  }
  .thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    flex: 0 0 2.25rem;
    border-radius: 0.25rem;
    background: rgb(15 23 42);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ext {
    font-size: 0.6rem;
    font-weight: 700;
    color: rgb(148 163 184);
  }
  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .name {
    font-size: 0.78rem;
    color: rgb(226 232 240);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .size {
    font-size: 0.68rem;
    color: rgb(100 116 139);
  }
  .rename {
    width: 100%;
    padding: 0.15rem 0.3rem;
    font-size: 0.78rem;
    color: rgb(226 232 240);
    background: rgb(15 23 42);
    border: 1px solid rgb(71 85 105);
    border-radius: 0.25rem;
  }
  .rename-actions,
  .actions {
    display: flex;
    gap: 0.25rem;
  }
  .actions button,
  .rename-actions button {
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    color: rgb(203 213 225);
    background: rgb(51 65 85);
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .actions button:hover,
  .rename-actions button:hover {
    background: rgb(71 85 105);
  }
  .actions .danger:hover {
    background: rgb(153 27 27);
    color: rgb(254 226 226);
  }
</style>
