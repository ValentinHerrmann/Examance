<script lang="ts">
  /** Domain move (issue #198), old address only: shown instead of the app to hybrid accounts, whose results live in this origin's browser storage and would stay behind. Once they moved them to the server or saved a backup, they continue on the new address. */
  import { faArrowUpRightFromSquare, faCloudArrowUp, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Button, Card, Checkbox } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { allowedStorageModes } from "#lib/stores/capabilities";
  import { requestedModeSwitch } from "#lib/services/storageModeSwitch";
  import { domainMove, newAddressHref, newHost, redirectDate } from "#lib/domainMove";
  import { fmt } from "#lib/utils/format";

  interface Props {
    /** Opens the workspace backup (the layout's ExportOptionsModal). */
    onBackup: () => void;
  }

  let { onBackup }: Props = $props();

  let backedUp = $state(false);
  const date = redirectDate();
  let vars = $derived({ from: domainMove?.from ?? "", host: newHost(), date: date ? $fmt.date(date) : "" });
  let canMove = $derived($allowedStorageModes.includes("all-server"));
</script>

<Card class="flex flex-col gap-4">
  <h1 class="m-0 text-xl font-medium text-content">{$t("domainMove.hybridTitle", vars)}</h1>
  <p class="m-0 text-sm text-muted">{$t("domainMove.hybridBody", vars)}</p>
  <!-- The browser trash (lib/trash/localTrash.ts) stays with this origin and can be restored only in hybrid mode. -->
  <p class="m-0 text-sm text-muted">
    {$t("domainMove.hybridTrash")}
    <a href="/trash" class="link">{$t("domainMove.hybridTrashLink")}</a>
  </p>

  <div class="flex flex-col gap-2 sm:flex-row">
    {#if canMove}
      <Button icon={faCloudArrowUp} onClick={() => requestedModeSwitch.set("all-server")}>
        {$t("domainMove.hybridMove")}
      </Button>
    {/if}
    <Button variant="outlined" severity="secondary" icon={faFloppyDisk} onClick={onBackup}>
      {$t("domainMove.hybridBackup")}
    </Button>
  </div>
  {#if canMove}
    <p class="m-0 text-xs text-muted">{$t("domainMove.hybridMoveHint", vars)}</p>
  {:else}
    <Alert severity="info">{$t("domainMove.hybridBackupOnly", vars)}</Alert>
  {/if}

  <Checkbox bind:checked={backedUp} label={$t("domainMove.hybridSaved")} />
  <div>
    <Button icon={faArrowUpRightFromSquare} disabled={!backedUp} href={newAddressHref("/unlock")}>
      {$t("domainMove.openNew", vars)}
    </Button>
  </div>
</Card>
