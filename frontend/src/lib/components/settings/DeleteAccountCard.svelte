<script lang="ts">
  // Deleting one's own account (GDPR Art. 17). This only asks: the server mails a single-use link
  // whose page (`routes/delete-account`) confirms the deletion. The holder may keep their library
  // exercises on the server without their name, for sharing later.
  import { apiErrorMessage } from "#lib/api/client";
  import { requestAccountDeletion } from "#lib/api/account";
  import { t } from "#lib/i18n";
  import { Alert, Button, Card, Checkbox } from "#lib/components/ui";

  interface Props {
    email: string;
  }

  let { email }: Props = $props();

  let keepExercises = $state(false);
  let busy = $state(false);
  let error = $state("");
  let sentMinutes = $state<number | null>(null);

  async function request() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      sentMinutes = await requestAccountDeletion(keepExercises);
    } catch (err) {
      error = apiErrorMessage(err, $t("settings.deleteAccount.failed"));
    } finally {
      busy = false;
    }
  }
</script>

<Card tone="danger" title={$t("settings.deleteAccount.heading")}>
  <p class="mt-0 mb-4 text-sm text-muted">{$t("settings.deleteAccount.description")}</p>
  {#if error}<Alert severity="danger" class="mb-4">{error}</Alert>{/if}
  {#if sentMinutes !== null}
    <Alert severity="info" class="mb-4">{$t("settings.deleteAccount.sent", { email, minutes: sentMinutes })}</Alert>
  {/if}
  <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); request(); }}>
    <div class="flex flex-col gap-1">
      <Checkbox bind:checked={keepExercises} disabled={busy} label={$t("settings.deleteAccount.keepExercises")} />
      <p class="m-0 text-xs text-muted">{$t("settings.deleteAccount.keepExercisesHint")}</p>
    </div>
    <div>
      <Button type="submit" severity="danger" loading={busy} class="w-full sm:w-auto">
        {sentMinutes !== null ? $t("settings.deleteAccount.resend") : $t("settings.deleteAccount.button")}
      </Button>
    </div>
  </form>
</Card>
