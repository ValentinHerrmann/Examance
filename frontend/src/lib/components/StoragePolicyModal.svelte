<script lang="ts">
  import { t, translate } from "$lib/i18n";
  import { createEventDispatcher } from "svelte";
  import { get } from "svelte/store";
  import {
    storagePolicyStore,
    type StorageMode,
  } from "$lib/stores/storagePolicy";
  import { backendStore, effectiveBackendStore } from "$lib/stores/backendStore";
  import { isAuthenticated } from "$lib/stores/session";
  import { wipeDatabase } from "$lib/db/hygiene";
  import { Modal, Button, controlClass } from "$lib/components/ui";
  import BackendUrlInput from "$lib/components/common/BackendUrlInput.svelte";

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
    "flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-base p-[0.85rem] transition-colors duration-150 ease-[ease] hover:border-line-strong";
  const optionCardActive =
    "flex cursor-pointer items-start gap-3 rounded-lg border border-accent bg-sky-400/[0.08] p-[0.85rem] transition-colors duration-150 ease-[ease]";
</script>

<Modal open={isOpen} size="md" title={$t("misc.storageModal.heading")} onClose={handleClose}>
  <div class="flex flex-col gap-6">
    {#if statusMsg}
      <div class="rounded-md border border-green-500 bg-green-500/15 p-3 text-sm text-green-300">{statusMsg}</div>
    {/if}

    <div>
      <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.storageHeading")}</h4>
      <p class="m-0 mb-3 text-[0.85rem] text-muted">{$t("misc.storageModal.storageDescription")}</p>

      <div class="flex flex-col gap-[0.6rem] sm:grid sm:grid-cols-3 sm:gap-3">
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
            <strong class="mb-[0.2rem] block text-[0.9rem] text-content">{$t("misc.storageModal.allLocalTitle")}</strong>
            <p class="m-0 text-[0.8rem] text-muted">{$t("misc.storageModal.allLocalText")}</p>
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
            <strong class="mb-[0.2rem] block text-[0.9rem] text-content">{$t("misc.storageModal.allServerTitle")}</strong>
            <p class="m-0 text-[0.8rem] text-muted">{$t("misc.storageModal.allServerText")}</p>
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
            <strong class="mb-[0.2rem] block text-[0.9rem] text-content">{$t("misc.storageModal.hybridTitle")}</strong>
            <p class="m-0 text-[0.8rem] text-muted">{$t("misc.storageModal.hybridText")}</p>
          </div>
        </label>
      </div>
    </div>

    <div>
      <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.latexHeading")}</h4>
      <p class="m-0 mb-3 text-[0.85rem] text-muted">{$t("misc.storageModal.latexDescription")}</p>

      <div class="flex flex-col gap-[0.6rem] sm:grid sm:grid-cols-3 sm:gap-3">
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
            <strong class="mb-[0.2rem] block text-[0.9rem] text-content">{$t("misc.storageModal.latexLocalTitle")}</strong>
            <p class="m-0 text-[0.8rem] text-muted">{$t("misc.storageModal.latexLocalText")}</p>
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
            <strong class="mb-[0.2rem] block text-[0.9rem] text-content">{$t("misc.storageModal.latexServerTitle")}</strong>
            <p class="m-0 text-[0.8rem] text-muted">{$t("misc.storageModal.latexServerText")}</p>
          </div>
        </label>
      </div>
    </div>

    <div>
      <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.backendHeading")}</h4>
      <p class="m-0 mb-3 text-[0.85rem] text-muted">{$t("misc.storageModal.backendDescription")}</p>
      <div class="flex items-center gap-2">
        <BackendUrlInput
          bind:value={customBackendUrl}
          placeholder={$t("misc.storageModal.backendPlaceholder")}
          class="flex-1"
        />
        <Button variant="primary" onClick={handleSaveBackendUrl}>{$t("common.save")}</Button>
      </div>
    </div>
  </div>

  <svelte:fragment slot="footer">
    <a href="/settings" class="mr-auto text-[0.85rem] text-accent no-underline hover:underline" on:click={handleClose}>
      {$t("misc.storageModal.fullSettingsLink")}
    </a>
    <Button variant="secondary" onClick={handleClose}>{$t("common.close")}</Button>
  </svelte:fragment>
</Modal>
