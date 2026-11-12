<script lang="ts">
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal } from "#lib/components/ui";

  /** Share one exercise group, the selected ones (issue #261) or all of them with every account, or stop sharing (issue #65). `afterSave` is the question after saving a new or unshared exercise (issue #263): No / Yes plus "Remember my decision". */
  interface Props {
    open?: boolean;
    /** `single` acts on one group and `selected` on the groups in `names` (`shared` = stop sharing them); the bulk modes on every own group. */
    mode?: "single" | "selected" | "bulkShare" | "bulkUnshare" | "afterSave";
    names?: string[];
    /** The group is shared now: the dialog offers to stop. */
    shared?: boolean;
    /** The account's address, shown to every other account while shared. */
    email?: string;
    name?: string;
    busy?: boolean;
    error?: string;
    /** `afterSave` passes whether to remember the answer. */
    onConfirm: (remember: boolean) => void;
    /** `afterSave` only: the No button. */
    onDecline?: (remember: boolean) => void;
    onClose: () => void;
  }

  let { open = false, mode = "single", shared = false, email = "", name = "", names = [], busy = false, error = "", onConfirm, onDecline, onClose }: Props = $props();

  let confirmed = $state(false);
  let remember = $state(false);
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
          : mode === "afterSave"
            ? $t("exercises.sharing.shareModal.afterSaveTitle")
            : stopping
              ? $t("exercises.sharing.shareModal.stopTitle")
              : $t("exercises.sharing.shareModal.title"),
  );

  $effect.pre(() => {
    if (open) {
      confirmed = false;
      remember = false;
    }
  });
</script>

<Modal {open} size="medium" {title} {onClose} {error}>
  {#if mode === "single" || mode === "afterSave"}
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
      <!-- Remembering a Yes is standing consent for future exercises, so the tick says so (same text as Settings). -->
      <Checkbox bind:checked={confirmed} label={mode === "afterSave" && remember ? $t("settings.shareDefault.alwaysConfirm") : $t("exercises.sharing.shareModal.confirm")} />
      {#if mode === "afterSave"}
        <div class="border-t border-line pt-3">
          <Checkbox bind:checked={remember} label={$t("exercises.sharing.shareModal.remember")} />
          <p class="m-0 mt-1 text-sm text-muted">{$t("exercises.sharing.shareModal.rememberHint")}</p>
        </div>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if mode === "afterSave"}
      <Button variant="outlined" severity="secondary" disabled={busy} onClick={() => onDecline?.(remember)}>{$t("exercises.sharing.shareModal.afterSaveNo")}</Button>
      <Button loading={busy} disabled={!confirmed} onClick={() => onConfirm(remember)}>{$t("exercises.sharing.shareModal.afterSaveYes")}</Button>
    {:else}
      <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
      {#if stopping}
        <Button severity="danger" loading={busy} onClick={() => onConfirm(false)}>{$t("exercises.sharing.stopSharing")}</Button>
      {:else}
        <Button loading={busy} disabled={!confirmed} onClick={() => onConfirm(false)}>{$t("exercises.sharing.shareModal.submit")}</Button>
      {/if}
    {/if}
  {/snippet}
</Modal>
