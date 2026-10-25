<script lang="ts">
  import { t } from "#lib/i18n";
  import { Alert } from "#lib/components/ui";
  import { maintenancePhase, maintenanceStore, secondsToStart } from "#lib/stores/maintenanceStore";
  import { maintenanceText } from "#lib/maintenance/text";

  // Sign-in still works until the second reminder; say what is coming so nobody starts long work (issue #130).
  let status = $derived($maintenanceStore.status);
  let vars = $derived({
    kind: $maintenanceText.kind(status),
    duration: $maintenanceText.duration(status),
    countdown: $maintenanceText.countdown($secondsToStart),
    time: $maintenanceText.time(status?.starts_at ?? null),
  });
</script>

{#if $maintenancePhase === "scheduled"}
  <Alert severity="info" class="mx-auto w-full max-w-form">{$t("maintenance.publicScheduled", vars)}</Alert>
{:else if $maintenancePhase === "warning"}
  <Alert severity="warning" class="mx-auto w-full max-w-form">{$t("maintenance.publicNotice", vars)}</Alert>
{/if}
