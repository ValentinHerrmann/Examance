<script lang="ts">
  import { t } from "$lib/i18n";
  import { Card } from "$lib/components/ui";

  /** Whether this browser has opted in. */
  export let enabled: boolean;
  /** Whether the configured backend accepts donations at all. */
  export let available: boolean;
  export let onChange: (enabled: boolean) => void;
</script>

{#if available}
  <Card class="mb-8">
    <h3 class="m-0 mb-2 text-accent">{$t("settings.donation.heading")}</h3>
    <p class="mt-0 mb-2 text-muted">{$t("settings.donation.description")}</p>
    <ul class="mt-0 mb-3 list-disc pl-5 text-xs text-subtle">
      <li>{$t("settings.donation.whatIsSent")}</li>
      <li>{$t("settings.donation.whatIsNotSent")}</li>
      <li>{$t("settings.donation.whenSent")}</li>
    </ul>
    <label class="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        class="mt-1 h-4 w-4 shrink-0 cursor-pointer"
        checked={enabled}
        on:change={(e) => onChange(e.currentTarget.checked)}
      />
      <span class="min-w-0 text-sm text-content">{$t("settings.donation.optIn")}</span>
    </label>
    <p class="mt-3 mb-0 text-xs text-subtle">
      {$t("settings.donation.privacyNote")}
      <a href="/legal/datenschutz" class="text-accent hover:underline">{$t("settings.donation.privacyLink")}</a>
    </p>
  </Card>
{/if}
