<script lang="ts">
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal } from "#lib/components/ui";

  /** Share an own exercise group with every account, or stop sharing it (issue #65). */
  interface Props {
    open?: boolean;
    /** The group is shared now: the dialog offers to stop. */
    shared?: boolean;
    /** The account's address, shown to every other account while shared. */
    email?: string;
    name?: string;
    busy?: boolean;
    error?: string;
    onConfirm: () => void;
    onClose: () => void;
  }

  let { open = false, shared = false, email = "", name = "", busy = false, error = "", onConfirm, onClose }: Props = $props();

  let confirmed = $state(false);

  $effect.pre(() => {
    if (open) confirmed = false;
  });
</script>

<Modal
  {open}
  size="medium"
  title={shared ? $t("exercises.sharing.shareModal.stopTitle") : $t("exercises.sharing.shareModal.title")}
  {onClose}
>
  {#if error}
    <div class="mb-3"><Alert severity="danger">{error}</Alert></div>
  {/if}
  <p class="m-0 mb-3 font-semibold text-content">{name || $t("exercises.untitled")}</p>
  {#if shared}
    <p class="m-0 text-content">{$t("exercises.sharing.shareModal.stopBody")}</p>
  {:else}
    <div class="flex flex-col gap-3 text-content">
      <p class="m-0">{$t("exercises.sharing.shareModal.intro")}</p>
      <p class="m-0">{$t("exercises.sharing.shareModal.variants")}</p>
      <Alert severity="warning">{$t("exercises.sharing.shareModal.email", { email })}</Alert>
      <p class="m-0">{$t("exercises.sharing.shareModal.copies")}</p>
      <Checkbox bind:checked={confirmed} label={$t("exercises.sharing.shareModal.confirm")} />
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    {#if shared}
      <Button severity="danger" loading={busy} onClick={onConfirm}>{$t("exercises.sharing.stopSharing")}</Button>
    {:else}
      <Button loading={busy} disabled={!confirmed} onClick={onConfirm}>{$t("exercises.sharing.shareModal.submit")}</Button>
    {/if}
  {/snippet}
</Modal>
