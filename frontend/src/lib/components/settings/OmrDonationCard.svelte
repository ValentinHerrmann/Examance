<script lang="ts">
  import { t } from "$lib/i18n";
  import { Card, Checkbox } from "$lib/components/ui";

  

  
  interface Props {
    /** Whether this browser has opted in. */
    enabled: boolean;
    /** Whether the configured backend accepts donations at all. */
    available: boolean;
    /** Donations need a server account; signed out, only switching off is possible. */
    signedIn: boolean;
    /** Host the samples would go to (the configured backend). */
    host: string;
    onChange: (enabled: boolean) => void;
  }

  let {
    enabled,
    available,
    signedIn,
    host,
    onChange
  }: Props = $props();
</script>

<!-- Also shown when the server is unavailable but consent is on: withdrawing must always work. -->
{#if available || enabled}
  <div id="donation" class="scroll-mt-16 lg:scroll-mt-4">
  <Card title={$t("settings.donation.heading")}>
    <p class="mt-0 mb-2 text-sm text-muted">{$t("settings.donation.description")}</p>
    <ul class="mt-0 mb-3 list-disc pl-5 text-xs text-muted">
      <li>{$t("settings.donation.whatIsSent")}</li>
      <li>{$t("settings.donation.whatIsNotSent")}</li>
      <li>{$t("settings.donation.whenSent")}</li>
      <li>{$t("settings.donation.recipient", { host })}</li>
    </ul>
    <Checkbox
      class="items-start"
      checked={enabled}
      disabled={!enabled && (!signedIn || !available)}
      onChange={onChange}
      label={$t("settings.donation.optIn")}
    />
    {#if !available}
      <p class="mt-2 mb-0 text-xs text-warning-fg">{$t("settings.donation.unavailable")}</p>
    {:else if !signedIn}
      <p class="mt-2 mb-0 text-xs text-warning-fg">{$t("settings.donation.signInRequired")}</p>
    {/if}
    <p class="mt-3 mb-0 text-xs text-muted">
      {$t("settings.donation.privacyNote")}
      <a href="/legal/datenschutz" class="link">{$t("settings.donation.privacyLink")}</a>
    </p>
  </Card>
  </div>
{/if}
