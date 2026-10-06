<script lang="ts">
  // The per-account switches an admin sets (issue #53), rendered from ACCOUNT_FEATURES so a new switch
  // needs no markup change here. Exams and exercises always live on the server and have no switch.
  import { ACCOUNT_FEATURES, type AccountFeature, type AccountFeatures } from "#lib/api/admin";
  import { t, type TranslationKey } from "#lib/i18n";
  import { Switch } from "#lib/components/ui";

  interface Props {
    features: AccountFeatures;
    disabled?: boolean;
    /** Leave out the "exercises are always on the server" footnote (lists repeat it per row otherwise). */
    compact?: boolean;
    onChange: (key: AccountFeature, value: boolean) => void;
  }

  let { features, disabled = false, compact = false, onChange }: Props = $props();

  const LABELS: Record<AccountFeature, TranslationKey> = {
    server_results: "admin.features.server_results",
    server_latex: "admin.features.server_latex",
  };
</script>

<div class="flex min-w-0 flex-col gap-2">
  {#each ACCOUNT_FEATURES as key (key)}
    <Switch checked={features[key]} {disabled} label={$t(LABELS[key])} onChange={(value) => onChange(key, value)} />
  {/each}
  {#if !compact}
    <p class="m-0 text-xs text-muted">{$t("admin.features.exercisesAlways")}</p>
  {/if}
</div>
