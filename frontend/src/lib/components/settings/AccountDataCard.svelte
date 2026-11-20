<script lang="ts">
  // GDPR Art. 15/20: a machine-readable copy of what the server holds about the account. Student data is exported per student in the GDPR section, because only this browser can read it.
  import { apiErrorMessage } from "#lib/api/client";
  import { accountExportFileName, exportAccountData } from "#lib/api/account";
  import { t } from "#lib/i18n";
  import { Alert, Button, Card, actionIcons } from "#lib/components/ui";
  import { downloadBlob } from "#lib/utils/download";

  interface Props {
    /** Admins hold no student data, so their text leaves out the per-student export. */
    admin?: boolean;
  }

  let { admin = false }: Props = $props();

  let busy = $state(false);
  let error = $state("");

  async function download() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      const data = await exportAccountData();
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), accountExportFileName());
    } catch (err) {
      error = apiErrorMessage(err, $t("settings.accountData.failed"));
    } finally {
      busy = false;
    }
  }
</script>

<Card title={$t("settings.accountData.heading")}>
  <p class="mt-0 mb-4 text-sm text-muted">{admin ? $t("settings.accountData.descriptionAdmin") : $t("settings.accountData.description")}</p>
  {#if error}<Alert severity="danger" class="mb-4">{error}</Alert>{/if}
  <Button icon={actionIcons.download} loading={busy} class="w-full sm:w-auto" onClick={download}>
    {$t("settings.accountData.button")}
  </Button>
</Card>
