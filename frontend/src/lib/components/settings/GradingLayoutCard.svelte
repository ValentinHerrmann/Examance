<script lang="ts">
  import { faHandPointLeft, faHandPointRight } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { apiErrorMessage } from "#lib/api/client";
  import { capabilitiesStore, saveGradingControlsSide, type ControlsSide } from "#lib/stores/capabilities";
  import { Alert, Card, OptionTile } from "#lib/components/ui";

  /** Side of the grading view's score panel, stamps and zoom controls (issue #328); stored on the account, so every device follows it. */
  let side = $derived($capabilitiesStore?.gradingControlsSide ?? "left");
  let busy = $state(false);
  let error = $state("");

  async function choose(next: ControlsSide) {
    if (next === side) return;
    busy = true;
    error = "";
    try {
      await saveGradingControlsSide(next);
    } catch (err) {
      error = apiErrorMessage(err, translate("settings.gradingLayout.failed"));
    } finally {
      busy = false;
    }
  }
</script>

{#if $capabilitiesStore}
  <div id="grading-layout" class="scroll-mt-16 lg:scroll-mt-4">
    <Card>
      <h2 class="m-0 mb-2 text-xl font-medium text-content">{$t("settings.gradingLayout.heading")}</h2>
      <p class="m-0 mb-4 text-sm text-muted">{$t("settings.gradingLayout.description")}</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OptionTile name="grading-controls-side" value="left" checked={side === "left"} disabled={busy} icon={faHandPointLeft} title={$t("settings.gradingLayout.left")} text={$t("settings.gradingLayout.leftHint")} onToggle={() => choose("left")} />
        <OptionTile name="grading-controls-side" value="right" checked={side === "right"} disabled={busy} icon={faHandPointRight} title={$t("settings.gradingLayout.right")} text={$t("settings.gradingLayout.rightHint")} onToggle={() => choose("right")} />
      </div>
      {#if error}
        <Alert severity="danger" class="mt-3">{error}</Alert>
      {/if}
    </Card>
  </div>
{/if}
