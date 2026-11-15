<script lang="ts">
  import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { apiErrorMessage } from "#lib/api/client";
  import { capabilitiesStore, saveReviewMail } from "#lib/stores/capabilities";
  import { Alert, Card, OptionTile } from "#lib/components/ui";

  /** Mail on a student's objection (issue #226): on unless switched off here; the server never puts names or texts in it. */
  let on = $derived($capabilitiesStore?.reviewMail !== false);
  let busy = $state(false);
  let error = $state("");

  async function toggle(next: boolean) {
    busy = true;
    error = "";
    try {
      await saveReviewMail(next ? null : false);
    } catch (err) {
      error = apiErrorMessage(err, translate("review.settings.failed"));
    } finally {
      busy = false;
    }
  }
</script>

{#if $capabilitiesStore}
  <div id="review-mail" class="scroll-mt-16 lg:scroll-mt-4">
    <Card>
      <h2 class="m-0 mb-4 text-xl font-medium text-content">{$t("review.settings.heading")}</h2>
      <OptionTile type="checkbox" checked={on} disabled={busy} icon={faEnvelope} title={$t("review.settings.mail")} text={$t("review.settings.mailHint")} onToggle={toggle} />
      {#if error}
        <Alert severity="danger" class="mt-3">{error}</Alert>
      {/if}
    </Card>
  </div>
{/if}
