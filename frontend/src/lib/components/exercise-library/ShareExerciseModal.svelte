<script lang="ts">
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal } from "#lib/components/ui";

  /** Share one exercise group or all of them with every account, or stop sharing (issue #65). */
  interface Props {
    open?: boolean;
    /** `single` acts on one group (`shared` = its current state); the bulk modes on every own group. */
    mode?: "single" | "bulkShare" | "bulkUnshare";
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

  let { open = false, mode = "single", shared = false, email = "", name = "", busy = false, error = "", onConfirm, onClose }: Props = $props();

  let confirmed = $state(false);
  let stopping = $derived(mode === "bulkUnshare" || (mode === "single" && shared));

  let title = $derived(
    mode === "bulkShare"
      ? $t("exercises.sharing.bulk.shareTitle")
      : mode === "bulkUnshare"
        ? $t("exercises.sharing.bulk.unshareTitle")
        : stopping
          ? $t("exercises.sharing.shareModal.stopTitle")
          : $t("exercises.sharing.shareModal.title"),
  );

  $effect.pre(() => {
    if (open) confirmed = false;
  });
</script>

<Modal {open} size="medium" {title} {onClose} {error}>
  {#if mode === "single"}
    <p class="m-0 mb-3 font-semibold text-content">{name || $t("exercises.untitled")}</p>
  {/if}
  {#if stopping}
    <p class="m-0 text-content">
      {mode === "bulkUnshare" ? $t("exercises.sharing.bulk.unshareBody") : $t("exercises.sharing.shareModal.stopBody")}
    </p>
  {:else}
    <div class="flex flex-col gap-3 text-content">
      <p class="m-0">{mode === "bulkShare" ? $t("exercises.sharing.bulk.shareIntro") : $t("exercises.sharing.shareModal.intro")}</p>
      <p class="m-0">{$t("exercises.sharing.shareModal.variants")}</p>
      <Alert severity="warning">{$t("exercises.sharing.shareModal.email", { email })}</Alert>
      <p class="m-0">{$t("exercises.sharing.shareModal.copies")}</p>
      <Checkbox bind:checked={confirmed} label={$t("exercises.sharing.shareModal.confirm")} />
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    {#if stopping}
      <Button severity="danger" loading={busy} onClick={onConfirm}>{$t("exercises.sharing.stopSharing")}</Button>
    {:else}
      <Button loading={busy} disabled={!confirmed} onClick={onConfirm}>{$t("exercises.sharing.shareModal.submit")}</Button>
    {/if}
  {/snippet}
</Modal>
