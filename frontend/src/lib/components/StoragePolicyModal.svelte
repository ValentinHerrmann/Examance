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
  import { Alert, Button, Modal } from "$lib/components/ui";
  import BackendUrlInput from "$lib/components/common/BackendUrlInput.svelte";
  import StorageModeSwitchWizard from "$lib/components/storage/StorageModeSwitchWizard.svelte";

  export let isOpen = false;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let statusMsg = "";
  let customBackendUrl = "";
  let isSwitchWizardOpen = false;
  let switchTarget: StorageMode | null = null;

  $: if (isOpen) {
    customBackendUrl = get(backendStore);
  }

  function handleClose() {
    statusMsg = "";
    dispatch("close");
  }

  /** Hands off to the gated storage-mode-switch wizard, which exports first. */
  function handleStorageModeChange(val: StorageMode) {
    if (val === $storagePolicyStore.storageMode) return;
    switchTarget = val;
    isSwitchWizardOpen = true;
  }

  function handleSwitchWizardClosed() {
    isSwitchWizardOpen = false;
    switchTarget = null;
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
    "flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-base p-3.5 transition-colors duration-150 hover:border-line-strong";
  const optionCardActive =
    "flex cursor-pointer items-start gap-3 rounded-md border border-accent bg-primary/10 p-3.5 transition-colors duration-150";
</script>

<Modal open={isOpen} size="medium" title={$t("misc.storageModal.heading")} onClose={handleClose}>
  <div class="flex flex-col gap-6">
    {#if statusMsg}
      <Alert severity="success">{statusMsg}</Alert>
    {/if}

    <div>
      <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.storageHeading")}</h4>
      <p class="m-0 mb-3 text-sm text-muted">{$t("misc.storageModal.storageDescription")}</p>

      <div class="flex flex-col gap-2.5 @xl:grid @xl:grid-cols-3 @xl:gap-3">
        <label class={$storagePolicyStore.storageMode === "all-local" ? optionCardActive : optionCardBase}>
          <input
            type="radio"
            name="storageMode"
            value="all-local"
            checked={$storagePolicyStore.storageMode === "all-local"}
            on:change={() => handleStorageModeChange("all-local")}
            class="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <div>
            <strong class="mb-1 block text-sm text-content">{$t("misc.storageModal.allLocalTitle")}</strong>
            <p class="m-0 text-xs text-muted">{$t("misc.storageModal.allLocalText")}</p>
          </div>
        </label>

        <label class={$storagePolicyStore.storageMode === "all-server" ? optionCardActive : optionCardBase}>
          <input
            type="radio"
            name="storageMode"
            value="all-server"
            checked={$storagePolicyStore.storageMode === "all-server"}
            on:change={() => handleStorageModeChange("all-server")}
            class="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <div>
            <strong class="mb-1 block text-sm text-content">{$t("misc.storageModal.allServerTitle")}</strong>
            <p class="m-0 text-xs text-muted">{$t("misc.storageModal.allServerText")}</p>
          </div>
        </label>

        <label class={$storagePolicyStore.storageMode === "hybrid" ? optionCardActive : optionCardBase}>
          <input
            type="radio"
            name="storageMode"
            value="hybrid"
            checked={$storagePolicyStore.storageMode === "hybrid"}
            on:change={() => handleStorageModeChange("hybrid")}
            class="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <div>
            <strong class="mb-1 block text-sm text-content">{$t("misc.storageModal.hybridTitle")}</strong>
            <p class="m-0 text-xs text-muted">{$t("misc.storageModal.hybridText")}</p>
          </div>
        </label>
      </div>
    </div>

    <div>
      <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.latexHeading")}</h4>
      <p class="m-0 mb-3 text-sm text-muted">{$t("misc.storageModal.latexDescription")}</p>

      <div class="flex flex-col gap-2.5 @xl:grid @xl:grid-cols-3 @xl:gap-3">
        <label class={$storagePolicyStore.latexCompilation === "local" ? optionCardActive : optionCardBase}>
          <input
            type="radio"
            name="latexMode"
            value="local"
            checked={$storagePolicyStore.latexCompilation === "local"}
            on:change={() => handleLatexChange("local")}
            class="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <div>
            <strong class="mb-1 block text-sm text-content">{$t("misc.storageModal.latexLocalTitle")}</strong>
            <p class="m-0 text-xs text-muted">{$t("misc.storageModal.latexLocalText")}</p>
          </div>
        </label>

        <label class={$storagePolicyStore.latexCompilation === "server" ? optionCardActive : optionCardBase}>
          <input
            type="radio"
            name="latexMode"
            value="server"
            checked={$storagePolicyStore.latexCompilation === "server"}
            on:change={() => handleLatexChange("server")}
            class="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <div>
            <strong class="mb-1 block text-sm text-content">{$t("misc.storageModal.latexServerTitle")}</strong>
            <p class="m-0 text-xs text-muted">{$t("misc.storageModal.latexServerText")}</p>
          </div>
        </label>
      </div>
    </div>

    <div>
      <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.backendHeading")}</h4>
      <p class="m-0 mb-3 text-sm text-muted">{$t("misc.storageModal.backendDescription")}</p>
      <div class="flex items-center gap-2">
        <BackendUrlInput
          bind:value={customBackendUrl}
          placeholder={$t("misc.storageModal.backendPlaceholder")}
          class="flex-1"
        />
        <Button onClick={handleSaveBackendUrl}>{$t("common.save")}</Button>
      </div>
    </div>
  </div>

  <svelte:fragment slot="footer">
    <a href="/settings" class="mr-auto text-sm text-accent no-underline hover:underline" on:click={handleClose}>
      {$t("misc.storageModal.fullSettingsLink")}
    </a>
    <Button variant="outlined" severity="secondary" onClick={handleClose}>{$t("common.close")}</Button>
  </svelte:fragment>
</Modal>

<StorageModeSwitchWizard
  open={isSwitchWizardOpen}
  target={switchTarget}
  onClose={handleSwitchWizardClosed}
/>
