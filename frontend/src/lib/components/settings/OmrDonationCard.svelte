<script lang="ts">
  import { t } from "$lib/i18n";
  import { Card } from "$lib/components/ui";

  /** Whether this browser has opted in. */
  export let enabled: boolean;
  /** Whether the configured backend accepts donations at all. */
  export let available: boolean;
  /** Donations need a server account; signed out, only switching off is possible. */
  export let signedIn: boolean;
  /** Host the samples would go to (the configured backend). */
  export let host: string;
  export let onChange: (enabled: boolean) => void;
</script>

<!-- Also shown when the server is unavailable but consent is on: withdrawing must always work. -->
{#if available || enabled}
  <Card class="mb-8">
    <h3 class="m-0 mb-2 text-accent">{$t("settings.donation.heading")}</h3>
    <p class="mt-0 mb-2 text-muted">{$t("settings.donation.description")}</p>
    <ul class="mt-0 mb-3 list-disc pl-5 text-xs text-subtle">
      <li>{$t("settings.donation.whatIsSent")}</li>
      <li>{$t("settings.donation.whatIsNotSent")}</li>
      <li>{$t("settings.donation.whenSent")}</li>
      <li>{$t("settings.donation.recipient", { host })}</li>
    </ul>
    <label class="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        class="mt-1 h-4 w-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
        checked={enabled}
        disabled={!enabled && (!signedIn || !available)}
        on:change={(e) => onChange(e.currentTarget.checked)}
      />
      <span class="min-w-0 text-sm text-content">{$t("settings.donation.optIn")}</span>
    </label>
    {#if !available}
      <p class="mt-2 mb-0 text-xs text-amber-300">{$t("settings.donation.unavailable")}</p>
    {:else if !signedIn}
      <p class="mt-2 mb-0 text-xs text-amber-300">{$t("settings.donation.signInRequired")}</p>
    {/if}
    <p class="mt-3 mb-0 text-xs text-subtle">
      {$t("settings.donation.privacyNote")}
      <a href="/legal/datenschutz" class="text-accent hover:underline">{$t("settings.donation.privacyLink")}</a>
    </p>
  </Card>
{/if}
