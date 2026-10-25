<script lang="ts">
  import { faScrewdriverWrench } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Button, Card, Icon } from "#lib/components/ui";
  import { maintenancePhase, maintenanceStore, secondsToStart } from "#lib/stores/maintenanceStore";
  import { maintenanceText } from "#lib/maintenance/text";

  interface Props {
    /** Admins are exempt (they end the window), so they may still open the form. */
    onAdminSignIn: () => void;
  }

  let { onAdminSignIn }: Props = $props();

  let status = $derived($maintenanceStore.status);
  let vars = $derived({
    kind: $maintenanceText.kind(status),
    duration: $maintenanceText.duration(status),
    countdown: $maintenanceText.countdown($secondsToStart),
  });
</script>

<Card class="mx-auto w-full max-w-form sm:p-6">
  <div class="text-center">
    <Icon icon={faScrewdriverWrench} class="mb-2 text-4xl text-info-fg" />
    <h2 class="m-0 mb-3 text-xl text-content">{$t("maintenance.signInPausedTitle")}</h2>
    <p class="mb-2 text-base leading-normal text-muted">{$t("maintenance.signInPausedBody", vars)}</p>
    {#if $maintenancePhase === "final"}
      <p class="mb-4 text-sm text-subtle">{$t("maintenance.signInPausedStart", vars)}</p>
    {/if}
    <Button variant="text" size="sm" onClick={onAdminSignIn}>{$t("maintenance.adminSignIn")}</Button>
  </div>
</Card>
