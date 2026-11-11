<script lang="ts">
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal } from "#lib/components/ui";

  /** Share one exercise group, the selected ones (issue #261) or all of them with every account, or stop sharing (issue #65). */
  interface Props {
    open?: boolean;
    /** `single` acts on one group and `selected` on the groups in `names` (`shared` = stop sharing them); the bulk modes on every own group. */
    mode?: "single" | "selected" | "bulkShare" | "bulkUnshare";
    names?: string[];
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

  let { open = false, mode = "single", shared = false, email = "", name = "", names = [], busy = false, error = "", onConfirm, onClose }: Props = $props();

  let confirmed = $state(false);
  let stopping = $derived(mode === "bulkUnshare" || (mode !== "bulkShare" && shared));

  let title = $derived(
    mode === "bulkShare"
      ? $t("exercises.sharing.bulk.shareTitle")
      : mode === "bulkUnshare"
        ? $t("exercises.sharing.bulk.unshareTitle")
        : mode === "selected"
          ? stopping
            ? $t("exercises.bulk.unshareTitle", { count: names.length })
            : $t("exercises.bulk.shareTitle", { count: names.length })
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
  {:else if mode === "selected"}
    <ul class="m-0 mb-3 max-h-40 overflow-y-auto pl-5 font-semibold text-content">
      {#each names as n, i (i)}<li>{n || $t("exercises.untitled")}</li>{/each}
    </ul>
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
