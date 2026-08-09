<script lang="ts">
  import "./StoragePolicyModal.css";
  import { createEventDispatcher, onMount } from "svelte";
  import { get } from "svelte/store";
  import {
    storagePolicyStore,
    type StorageMode,
  } from "$lib/stores/storagePolicy";
  import { backendStore, effectiveBackendStore } from "$lib/stores/backendStore";
  import { isAuthenticated } from "$lib/stores/session";
  import { wipeDatabase } from "$lib/db/hygiene";

  export let isOpen = false;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let statusMsg = "";
  let customBackendUrl = "";

  $: if (isOpen) {
    customBackendUrl = get(backendStore);
  }

  function handleClose() {
    statusMsg = "";
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      handleClose();
    }
  }

  async function handleStorageModeChange(val: StorageMode) {
    if (val === $storagePolicyStore.storageMode) return;

    if ((val === "all-server" || val === "hybrid") && !get(isAuthenticated)) {
      alert("Server storage modes require an authenticated session. Please log in.");
      window.location.href = "/unlock";
      return;
    }

    const confirmed = confirm(
      "Changing storage mode requires clearing the current active session state. Please make sure you have exported a .bgproj backup first!\n\nDo you want to proceed and switch storage mode?"
    );
    if (!confirmed) return;

    await wipeDatabase();
    storagePolicyStore.updateSetting("storageMode", val);
    statusMsg = `Global Storage Mode updated to ${val}. Session cleared.`;
    window.location.reload();
  }

  async function handleLatexChange(val: "server" | "local") {
    if (val === $storagePolicyStore.latexCompilation) return;

    if (val === "server" && !get(isAuthenticated)) {
      alert("Server compilation requires an authenticated session. Please log in.");
      window.location.href = "/unlock";
      return;
    }
    storagePolicyStore.updateSetting("latexCompilation", val);
    statusMsg = `LaTeX Compilation set to ${val}.`;
  }

  function handleSaveBackendUrl() {
    const trimmed = customBackendUrl.trim();
    if (!trimmed) {
      statusMsg = "Please enter a backend server address.";
      return;
    }
    backendStore.saveSuccessfulBackendUrl(trimmed);
    statusMsg = `Backend server address updated to: ${$effectiveBackendStore}`;
  }

  const optionCardBase =
    "flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-900 p-[0.85rem] transition-colors duration-150 ease-[ease] hover:border-slate-600";
  const optionCardActive =
    "flex cursor-pointer items-start gap-3 rounded-lg border border-sky-400 bg-sky-400/[0.08] p-[0.85rem] transition-colors duration-150 ease-[ease]";
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/85 p-4 backdrop-blur"
    role="button"
    tabindex="-1"
    on:click|self={handleClose}
  >
    <div class="storage-policy-scale-in flex max-h-[90vh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl border border-sky-400 bg-slate-800 text-slate-50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)]" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-6 py-5">
        <h3 id="modal-title" class="m-0 text-[1.15rem] text-sky-400">Storage & Server Configuration</h3>
        <button type="button" class="cursor-pointer rounded border-0 bg-transparent p-1 text-[1.2rem] leading-none text-slate-400 transition-colors duration-150 ease-[ease] hover:text-slate-100" on:click={handleClose}>×</button>
      </div>

      {#if statusMsg}
        <div class="rounded-md border border-green-500 bg-green-500/15 p-3 text-sm text-green-300">{statusMsg}</div>
      {/if}

      <div class="flex flex-col gap-6 overflow-y-auto p-6">
        <div>
          <h4 class="m-0 mb-1 text-base text-slate-50">1. Storage Policy</h4>
          <p class="m-0 mb-3 text-[0.85rem] text-slate-400">Select where exam data and student grades are stored:</p>

          <div class="flex flex-col gap-[0.6rem] min-[900px]:grid min-[900px]:grid-cols-3 min-[900px]:gap-3">
            <label class={$storagePolicyStore.storageMode === "all-local" ? optionCardActive : optionCardBase}>
              <input
                type="radio"
                name="storageMode"
                value="all-local"
                checked={$storagePolicyStore.storageMode === "all-local"}
                on:change={() => handleStorageModeChange("all-local")}
                class="mt-[0.2rem]"
              />
              <div>
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">🔒 All Local (Zero Cloud)</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">All data stays on this device in encrypted IndexedDB. No backend required.</p>
              </div>
            </label>

            <label class={$storagePolicyStore.storageMode === "all-server" ? optionCardActive : optionCardBase}>
              <input
                type="radio"
                name="storageMode"
                value="all-server"
                checked={$storagePolicyStore.storageMode === "all-server"}
                on:change={() => handleStorageModeChange("all-server")}
                class="mt-[0.2rem]"
              />
              <div>
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">☁️ All Server</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">All data synchronized and stored on the secure BlindGrade server.</p>
              </div>
            </label>

            <label class={$storagePolicyStore.storageMode === "hybrid" ? optionCardActive : optionCardBase}>
              <input
                type="radio"
                name="storageMode"
                value="hybrid"
                checked={$storagePolicyStore.storageMode === "hybrid"}
                on:change={() => handleStorageModeChange("hybrid")}
                class="mt-[0.2rem]"
              />
              <div>
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">⚖️ Hybrid Mode</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">Exercise library and exam templates on server, but student identities stay 100% local.</p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <h4 class="m-0 mb-1 text-base text-slate-50">2. LaTeX Compilation Engine</h4>
          <p class="m-0 mb-3 text-[0.85rem] text-slate-400">Select engine for rendering LaTeX exam documents to PDF:</p>

          <div class="flex flex-col gap-[0.6rem] min-[900px]:grid min-[900px]:grid-cols-3 min-[900px]:gap-3">
            <label class={$storagePolicyStore.latexCompilation === "local" ? optionCardActive : optionCardBase}>
              <input
                type="radio"
                name="latexMode"
                value="local"
                checked={$storagePolicyStore.latexCompilation === "local"}
                on:change={() => handleLatexChange("local")}
                class="mt-[0.2rem]"
              />
              <div>
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">⚡ Browser Local (WASM BusyTeX)</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">Compiles inside browser without sending source to any server.</p>
              </div>
            </label>

            <label class={$storagePolicyStore.latexCompilation === "server" ? optionCardActive : optionCardBase}>
              <input
                type="radio"
                name="latexMode"
                value="server"
                checked={$storagePolicyStore.latexCompilation === "server"}
                on:change={() => handleLatexChange("server")}
                class="mt-[0.2rem]"
              />
              <div>
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">⚡ Server (Tectonic)</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">High performance server-side compilation. Requires authenticated account.</p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <h4 class="m-0 mb-1 text-base text-slate-50">3. Backend Server Address</h4>
          <p class="m-0 mb-3 text-[0.85rem] text-slate-400">Configure custom API server address (e.g. local backend server):</p>
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={customBackendUrl}
              placeholder="e.g. http://localhost:8000"
              class="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-[0.55rem] text-[0.875rem] text-slate-50 focus:border-sky-400 focus:outline-none"
            />
            <button type="button" class="cursor-pointer rounded-md border-0 bg-sky-600 px-4 py-[0.55rem] text-[0.85rem] font-semibold text-white hover:bg-sky-700" on:click={handleSaveBackendUrl}>Save</button>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-slate-700 bg-slate-900 px-6 py-4">
        <a href="/settings" class="text-[0.85rem] text-sky-400 no-underline hover:underline" on:click={handleClose}>
          Full Settings & GDPR Erasure ↗
        </a>
        <button type="button" class="cursor-pointer rounded-md border-0 bg-slate-700 px-5 py-[0.55rem] font-medium text-slate-50 hover:bg-slate-600" on:click={handleClose}>Close</button>
      </div>
    </div>
  </div>
{/if}
