<script lang="ts">
  import { faEraser } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { apiErrorMessage } from "#lib/api/client";
  import { penSeenStore, resetPenDetection } from "#lib/stores/penInput";
  import { capabilitiesStore, saveGradingScratchOut } from "#lib/stores/capabilities";
  import { Alert, Button, Card, OptionTile } from "#lib/components/ui";

  /** Pen detection of this device (issue #233) and, for teachers, the account's scratch-out switch (issue #330). */
  let { scratchOut = false }: { scratchOut?: boolean } = $props();
  let done = $state(false);
  let scratchOn = $derived($capabilitiesStore?.gradingScratchOut !== false);
  let busy = $state(false);
  let error = $state("");

  async function toggleScratchOut(next: boolean) {
    busy = true;
    error = "";
    try {
      await saveGradingScratchOut(next);
    } catch (err) {
      error = apiErrorMessage(err, translate("settings.penInput.scratchOutFailed"));
    } finally {
      busy = false;
    }
  }

  function reset() {
    resetPenDetection();
    done = true;
  }
</script>

<div id="pen-input" class="scroll-mt-16 lg:scroll-mt-4">
  <Card title={$t("settings.penInput.heading")}>
    <p class="m-0 mb-3 text-sm text-muted">{$t("settings.penInput.description")}</p>
    <p class="m-0 mb-3 text-sm text-content">
      {$penSeenStore ? $t("settings.penInput.statusPen") : $t("settings.penInput.statusNoPen")}
    </p>
    <Button
      variant="outlined"
      severity="secondary"
      disabled={!$penSeenStore}
      title={$penSeenStore ? undefined : $t("settings.penInput.resetDisabled")}
      onClick={reset}
    >{$t("settings.penInput.reset")}</Button>
    {#if !$penSeenStore && !done}
      <p class="m-0 mt-2 text-xs text-muted">{$t("settings.penInput.resetDisabled")}</p>
    {/if}
    {#if done && !$penSeenStore}
      <Alert severity="success" class="mt-3" onDismiss={() => (done = false)}>{$t("settings.penInput.resetDone")}</Alert>
    {/if}
    {#if scratchOut && $capabilitiesStore}
      <div class="mt-4 border-t border-line pt-4">
        <OptionTile type="checkbox" checked={scratchOn} disabled={busy} icon={faEraser} title={$t("settings.penInput.scratchOut")} text={$t("settings.penInput.scratchOutHint")} onToggle={toggleScratchOut} />
        {#if error}
          <Alert severity="danger" class="mt-3">{error}</Alert>
        {/if}
      </div>
    {/if}
  </Card>
</div>
