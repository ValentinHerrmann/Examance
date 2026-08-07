<script lang="ts">
  import './StoragePolicyModal.css';
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
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="storage-policy-modal-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={handleClose}
  >
    <div class="storage-policy-modal-modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="storage-policy-modal-modal-header">
        <h3 id="modal-title">Storage & Server Configuration</h3>
        <button type="button" class="storage-policy-modal-close-btn" on:click={handleClose}>×</button>
      </div>

      {#if statusMsg}
        <div class="storage-policy-modal-status-banner">{statusMsg}</div>
      {/if}

      <div class="storage-policy-modal-modal-body">
        <div class="storage-policy-modal-section">
          <h4>1. Storage Policy</h4>
          <p class="storage-policy-modal-description">Select where exam data and student grades are stored:</p>

          <div class="storage-policy-modal-options-grid">
            <label class="storage-policy-modal-option-card" class:storage-policy-modal-active={$storagePolicyStore.storageMode === "all-local"}>
              <input
                type="radio"
                name="storageMode"
                value="all-local"
                checked={$storagePolicyStore.storageMode === "all-local"}
                on:change={() => handleStorageModeChange("all-local")}
              />
              <div class="storage-policy-modal-option-content">
                <strong>🔒 All Local (Zero Cloud)</strong>
                <p>All data stays on this device in encrypted IndexedDB. No backend required.</p>
              </div>
            </label>

            <label class="storage-policy-modal-option-card" class:storage-policy-modal-active={$storagePolicyStore.storageMode === "all-server"}>
              <input
                type="radio"
                name="storageMode"
                value="all-server"
                checked={$storagePolicyStore.storageMode === "all-server"}
                on:change={() => handleStorageModeChange("all-server")}
              />
              <div class="storage-policy-modal-option-content">
                <strong>☁️ All Server</strong>
                <p>All data synchronized and stored on the secure BlindGrade server.</p>
              </div>
            </label>

            <label class="storage-policy-modal-option-card" class:storage-policy-modal-active={$storagePolicyStore.storageMode === "hybrid"}>
              <input
                type="radio"
                name="storageMode"
                value="hybrid"
                checked={$storagePolicyStore.storageMode === "hybrid"}
                on:change={() => handleStorageModeChange("hybrid")}
              />
              <div class="storage-policy-modal-option-content">
                <strong>⚖️ Hybrid Mode</strong>
                <p>Exercise library and exam templates on server, but student identities stay 100% local.</p>
              </div>
            </label>
          </div>
        </div>

        <div class="storage-policy-modal-section">
          <h4>2. LaTeX Compilation Engine</h4>
          <p class="storage-policy-modal-description">Select engine for rendering LaTeX exam documents to PDF:</p>

          <div class="storage-policy-modal-options-grid">
            <label class="storage-policy-modal-option-card" class:storage-policy-modal-active={$storagePolicyStore.latexCompilation === "local"}>
              <input
                type="radio"
                name="latexMode"
                value="local"
                checked={$storagePolicyStore.latexCompilation === "local"}
                on:change={() => handleLatexChange("local")}
              />
              <div class="storage-policy-modal-option-content">
                <strong>⚡ Browser Local (WASM BusyTeX)</strong>
                <p>Compiles inside browser without sending source to any server.</p>
              </div>
            </label>

            <label class="storage-policy-modal-option-card" class:storage-policy-modal-active={$storagePolicyStore.latexCompilation === "server"}>
              <input
                type="radio"
                name="latexMode"
                value="server"
                checked={$storagePolicyStore.latexCompilation === "server"}
                on:change={() => handleLatexChange("server")}
              />
              <div class="storage-policy-modal-option-content">
                <strong>⚡ Server (Tectonic)</strong>
                <p>High performance server-side compilation. Requires authenticated account.</p>
              </div>
            </label>
          </div>
        </div>

        <div class="storage-policy-modal-section">
          <h4>3. Backend Server Address</h4>
          <p class="storage-policy-modal-description">Configure custom API server address (e.g. local backend server):</p>
          <div class="storage-policy-modal-backend-input-row">
            <input
              type="text"
              bind:value={customBackendUrl}
              placeholder="e.g. http://localhost:8000"
              class="storage-policy-modal-url-input"
            />
            <button type="button" class="storage-policy-modal-apply-btn" on:click={handleSaveBackendUrl}>Save</button>
          </div>
        </div>
      </div>

      <div class="storage-policy-modal-modal-footer">
        <a href="/settings" class="storage-policy-modal-advanced-link" on:click={handleClose}>
          Full Settings & GDPR Erasure ↗
        </a>
        <button type="button" class="storage-policy-modal-close-modal-btn" on:click={handleClose}>Close</button>
      </div>
    </div>
  </div>
{/if}
