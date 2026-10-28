<script lang="ts">
  // First sign-in only (M3): the account must choose where its results live before any route mounts.
  // Changing it later is the storage card in /settings; both open the layout's move dialog.
  import { t } from "#lib/i18n";
  import { Alert, Modal } from "#lib/components/ui";
  import SettingsForm from "#lib/components/settings/SettingsForm.svelte";
  import { storagePolicyStore } from "#lib/stores/storagePolicy";
  import { allowedStorageModes } from "#lib/stores/capabilities";
  import { requestedModeSwitch } from "#lib/services/storageModeSwitch";

  let { isOpen = false }: { isOpen?: boolean } = $props();
</script>

<Modal open={isOpen} size="medium" title={$t("storagePolicy.choice.title")} closeOnEscape={false}>
  <div class="flex flex-col gap-4">
    <Alert severity="info">{$t("storagePolicy.choice.body")}</Alert>
    <SettingsForm
      part="storage"
      storageMode={$storagePolicyStore.storageMode}
      allowedModes={$allowedStorageModes}
      onStorageModeChange={(mode) => requestedModeSwitch.set(mode)}
    />
  </div>
</Modal>
