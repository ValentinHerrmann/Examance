<script lang="ts">
  import { t } from "#lib/i18n";
  import { penSeenStore, resetPenDetection } from "#lib/stores/penInput";
  import { Alert, Button, Card } from "#lib/components/ui";

  /** Pen detection of this device (issue #233): shows whether fingers draw in the grading view and lets the teacher reset it. */
  let done = $state(false);

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
  </Card>
</div>
