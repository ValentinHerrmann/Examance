<script lang="ts">
  import { t, translate } from "$lib/i18n";
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
      alert(translate("settings.alerts.serverStorageNeedsAuth"));
      window.location.href = "/unlock";
      return;
    }

    const confirmed = confirm(translate("settings.alerts.storageModeConfirm"));
    if (!confirmed) return;

    await wipeDatabase();
    storagePolicyStore.updateSetting("storageMode", val);
    statusMsg = translate("settings.status.storageModeSet", { mode: val });
    window.location.reload();
  }

  async function handleLatexChange(val: "server" | "local") {
    if (val === $storagePolicyStore.latexCompilation) return;

    if (val === "server" && !get(isAuthenticated)) {
      alert(translate("settings.alerts.serverCompileNeedsAuth"));
      window.location.href = "/unlock";
      return;
    }
    storagePolicyStore.updateSetting("latexCompilation", val);
    statusMsg = translate("settings.status.latexSet", { mode: val });
  }

  function handleSaveBackendUrl() {
    const trimmed = customBackendUrl.trim();
    if (!trimmed) {
      statusMsg = translate("misc.storageModal.backendEmpty");
      return;
    }
    try {
      backendStore.saveSuccessfulBackendUrl(trimmed);
    } catch (err: any) {
      // Rejected addresses must be reported, not swallowed: this value decides
      // where session cookies and the login request are sent.
      statusMsg = err?.message ?? translate("misc.storageModal.backendInvalid");
      return;
    }
    statusMsg = translate("misc.storageModal.backendUpdated", { url: $effectiveBackendStore });
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
        <h3 id="modal-title" class="m-0 text-[1.15rem] text-sky-400">{$t("misc.storageModal.heading")}</h3>
        <button type="button" class="cursor-pointer rounded border-0 bg-transparent p-1 text-[1.2rem] leading-none text-slate-400 transition-colors duration-150 ease-[ease] hover:text-slate-100" on:click={handleClose}>×</button>
      </div>

      {#if statusMsg}
        <div class="rounded-md border border-green-500 bg-green-500/15 p-3 text-sm text-green-300">{statusMsg}</div>
      {/if}

      <div class="flex flex-col gap-6 overflow-y-auto p-6">
        <div>
          <h4 class="m-0 mb-1 text-base text-slate-50">{$t("misc.storageModal.storageHeading")}</h4>
          <p class="m-0 mb-3 text-[0.85rem] text-slate-400">{$t("misc.storageModal.storageDescription")}</p>

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
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">{$t("misc.storageModal.allLocalTitle")}</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">{$t("misc.storageModal.allLocalText")}</p>
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
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">{$t("misc.storageModal.allServerTitle")}</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">{$t("misc.storageModal.allServerText")}</p>
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
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">{$t("misc.storageModal.hybridTitle")}</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">{$t("misc.storageModal.hybridText")}</p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <h4 class="m-0 mb-1 text-base text-slate-50">{$t("misc.storageModal.latexHeading")}</h4>
          <p class="m-0 mb-3 text-[0.85rem] text-slate-400">{$t("misc.storageModal.latexDescription")}</p>

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
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">{$t("misc.storageModal.latexLocalTitle")}</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">{$t("misc.storageModal.latexLocalText")}</p>
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
                <strong class="mb-[0.2rem] block text-[0.9rem] text-slate-50">{$t("misc.storageModal.latexServerTitle")}</strong>
                <p class="m-0 text-[0.8rem] text-slate-400">{$t("misc.storageModal.latexServerText")}</p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <h4 class="m-0 mb-1 text-base text-slate-50">{$t("misc.storageModal.backendHeading")}</h4>
          <p class="m-0 mb-3 text-[0.85rem] text-slate-400">{$t("misc.storageModal.backendDescription")}</p>
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={customBackendUrl}
              placeholder={$t("misc.storageModal.backendPlaceholder")}
              class="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-[0.55rem] text-[0.875rem] text-slate-50 focus:border-sky-400 focus:outline-none"
            />
            <button type="button" class="cursor-pointer rounded-md border-0 bg-sky-600 px-4 py-[0.55rem] text-[0.85rem] font-semibold text-white hover:bg-sky-700" on:click={handleSaveBackendUrl}>{$t("common.save")}</button>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-slate-700 bg-slate-900 px-6 py-4">
        <a href="/settings" class="text-[0.85rem] text-sky-400 no-underline hover:underline" on:click={handleClose}>
          {$t("misc.storageModal.fullSettingsLink")}
        </a>
        <button type="button" class="cursor-pointer rounded-md border-0 bg-slate-700 px-5 py-[0.55rem] font-medium text-slate-50 hover:bg-slate-600" on:click={handleClose}>{$t("common.close")}</button>
      </div>
    </div>
  </div>
{/if}
