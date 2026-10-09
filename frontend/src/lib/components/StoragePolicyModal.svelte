<script lang="ts">
  import { t, translate } from "#lib/i18n";
  import { get } from "svelte/store";
  import { STORAGE_MODES, storagePolicyStore, type StorageMode } from "#lib/stores/storagePolicy";
  import { allowedStorageModes, effectiveLatexStore, featuresStore } from "#lib/stores/capabilities";
  import { backendStore, effectiveBackendStore } from "#lib/stores/backendStore";
  import { Alert, Button, Icon, Modal } from "#lib/components/ui";
  import { dataPlaceIcons, latexPlaceIcons } from "#lib/components/storage/placeIcons";
  import BackendUrlInput from "#lib/components/common/BackendUrlInput.svelte";
  import StorageModeSwitchWizard from "#lib/components/storage/StorageModeSwitchWizard.svelte";

  interface Props {
    isOpen?: boolean;
    /**
     * The account has no storage mode yet (or its mode is no longer allowed): the modal cannot be
     * dismissed, explains the choice, pre-selects nothing, and leads only to choosing a mode.
     */
    mustChoose?: boolean;
    onClose?: () => void;
    /** False for an admin account: it holds no exams, so only the server address is offered (issue #58). */
    teaching?: boolean;
  }

  let { isOpen = false, mustChoose = false, onClose, teaching = true }: Props = $props();

  let statusMsg = $state("");
  let customBackendUrl = $state("");
  let isSwitchWizardOpen = $state(false);
  let switchTarget: StorageMode | null = $state(null);

  // Options come from the account's capabilities, so a mode an admin disabled shows as unavailable.
  const MODE_COPY = {
    "all-server": { title: "misc.storageModal.allServerTitle", text: "misc.storageModal.allServerText" },
    hybrid: { title: "misc.storageModal.hybridTitle", text: "misc.storageModal.hybridText" },
  } as const;

  function handleClose() {
    if (mustChoose) return;
    statusMsg = "";
    onClose?.();
  }

  /** Hands off to the move dialog; the mode only changes once the results have arrived. */
  function handleStorageModeChange(val: StorageMode) {
    if (val === $storagePolicyStore.storageMode || !$allowedStorageModes.includes(val)) return;
    switchTarget = val;
    isSwitchWizardOpen = true;
  }

  function handleSwitchWizardClosed() {
    isSwitchWizardOpen = false;
    switchTarget = null;
  }

  function handleLatexChange(val: "server" | "local") {
    if (val === $storagePolicyStore.latexCompilation) return;
    if (val === "server" && !$featuresStore.server_latex) return;
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
  const optionCardDisabled = "cursor-not-allowed opacity-60";

  $effect.pre(() => {
    if (isOpen) {
      customBackendUrl = get(backendStore);
    }
  });
</script>

<Modal
  open={isOpen}
  size="medium"
  title={mustChoose ? $t("storagePolicy.choice.title") : $t("misc.storageModal.heading")}
  closeOnEscape={!mustChoose}
  onClose={mustChoose ? undefined : handleClose}
>
  <div class="flex flex-col gap-6">
    {#if statusMsg}
      <Alert severity="success">{statusMsg}</Alert>
    {/if}

    {#if mustChoose}
      <Alert severity="info">{$t("storagePolicy.choice.body")}</Alert>
    {/if}

    {#if teaching}
    <div>
      <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.storageHeading")}</h4>
      <p class="m-0 mb-3 text-sm text-muted">{$t("misc.storageModal.storageDescription")}</p>

      <div class="flex flex-col gap-2.5 @xl:grid @xl:grid-cols-2 @xl:gap-3">
        {#each STORAGE_MODES as mode (mode)}
          {@const allowed = $allowedStorageModes.includes(mode)}
          <label
            class="{$storagePolicyStore.storageMode === mode ? optionCardActive : optionCardBase} {allowed
              ? ''
              : optionCardDisabled}"
          >
            <input
              type="radio"
              name="storageMode"
              value={mode}
              checked={$storagePolicyStore.storageMode === mode}
              disabled={!allowed}
              onclick={(e) => { e.preventDefault(); handleStorageModeChange(mode); }}
              class="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <div>
              <strong class="mb-1 flex items-center gap-1.5 text-sm text-content">
                <Icon icon={dataPlaceIcons[mode]} class="text-muted" />{$t(MODE_COPY[mode].title)}
              </strong>
              <p class="m-0 text-xs text-muted">{$t(MODE_COPY[mode].text)}</p>
              {#if !allowed}
                <p class="m-0 mt-1 text-xs text-muted">{$t("storagePolicy.notEnabled")}</p>
              {/if}
            </div>
          </label>
        {/each}
      </div>
    </div>
    {/if}

    {#if !mustChoose && teaching}
      <div>
        <h4 class="m-0 mb-1 text-base text-content">{$t("misc.storageModal.latexHeading")}</h4>
        <p class="m-0 mb-3 text-sm text-muted">{$t("misc.storageModal.latexDescription")}</p>

        <div class="flex flex-col gap-2.5 @xl:grid @xl:grid-cols-2 @xl:gap-3">
          <label class={$effectiveLatexStore === "local" ? optionCardActive : optionCardBase}>
            <input
              type="radio"
              name="latexMode"
              value="local"
              checked={$effectiveLatexStore === "local"}
              onclick={(e) => { e.preventDefault(); handleLatexChange("local"); }}
              class="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <div>
              <strong class="mb-1 flex items-center gap-1.5 text-sm text-content"><Icon icon={latexPlaceIcons.local} class="text-muted" />{$t("misc.storageModal.latexLocalTitle")}</strong>
              <p class="m-0 text-xs text-muted">{$t("misc.storageModal.latexLocalText")}</p>
            </div>
          </label>

          <label
            class="{$effectiveLatexStore === 'server' ? optionCardActive : optionCardBase} {$featuresStore.server_latex
              ? ''
              : optionCardDisabled}"
          >
            <input
              type="radio"
              name="latexMode"
              value="server"
              checked={$effectiveLatexStore === "server"}
              disabled={!$featuresStore.server_latex}
              onclick={(e) => { e.preventDefault(); handleLatexChange("server"); }}
              class="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <div>
              <strong class="mb-1 flex items-center gap-1.5 text-sm text-content"><Icon icon={latexPlaceIcons.server} class="text-muted" />{$t("misc.storageModal.latexServerTitle")}</strong>
              <p class="m-0 text-xs text-muted">{$t("misc.storageModal.latexServerText")}</p>
              {#if !$featuresStore.server_latex}
                <p class="m-0 mt-1 text-xs text-muted">{$t("storagePolicy.notEnabled")}</p>
              {/if}
            </div>
          </label>
        </div>
      </div>
    {/if}

    {#if !mustChoose}
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
    {/if}
  </div>

  {#snippet footer()}
    {#if !mustChoose}
      <a href="/settings" class="mr-auto text-sm text-accent no-underline hover:underline" onclick={handleClose}>
        {$t("misc.storageModal.fullSettingsLink")}
      </a>
      <Button variant="outlined" severity="secondary" onClick={handleClose}>{$t("common.close")}</Button>
    {/if}
  {/snippet}
</Modal>

<StorageModeSwitchWizard
  open={isSwitchWizardOpen}
  target={switchTarget}
  onClose={handleSwitchWizardClosed}
/>
