<script lang="ts">
  // Always-allowed domains (issue #53): a verified registration from a listed domain is approved on the
  // spot with that domain's features. Changes apply to future registrations only.
  import { faTrash } from "@fortawesome/free-solid-svg-icons";
  import { ALL_FEATURES_ON, type AccountFeature, type AccountFeatures, type AllowedDomain } from "#lib/api/admin";
  import { t } from "#lib/i18n";
  import { Alert, Button, Field, TextInput } from "#lib/components/ui";
  import FeatureMatrix from "./FeatureMatrix.svelte";
  import FeatureSwitches from "./FeatureSwitches.svelte";

  interface Props {
    domains: AllowedDomain[];
    busy: boolean;
    /** Resolves true when the domain was added, which clears the form. */
    onAdd: (domain: string, features: AccountFeatures) => Promise<boolean>;
    onToggleFeature: (domain: AllowedDomain, key: AccountFeature, value: boolean) => void;
    onRemove: (domain: AllowedDomain) => void;
  }

  let { domains, busy, onAdd, onToggleFeature, onRemove }: Props = $props();

  let newDomain = $state("");
  let features = $state<AccountFeatures>({ ...ALL_FEATURES_ON });

  async function submit() {
    if (await onAdd(newDomain.trim(), $state.snapshot(features))) {
      newDomain = "";
      features = { ...ALL_FEATURES_ON };
    }
  }
</script>

{#snippet identity(domain: AllowedDomain)}@{domain.domain}{/snippet}

{#snippet actions(domain: AllowedDomain)}
  <Button
    iconOnly
    icon={faTrash}
    variant="text"
    severity="danger"
    size="sm"
    ariaLabel={$t("admin.domains.remove", { domain: domain.domain })}
    disabled={busy}
    onClick={() => onRemove(domain)}
  />
{/snippet}

<div class="flex min-w-0 flex-col gap-4">
  <Alert severity="warning">{$t("admin.domains.warning")}</Alert>

  {#if domains.length === 0}
    <p class="m-0 text-sm text-muted">{$t("admin.domains.empty")}</p>
  {:else}
    <FeatureMatrix
      rows={domains}
      rowLabel={(domain) => domain.domain}
      tableLabel={$t("admin.domains.title")}
      headers={[$t("admin.domains.columnDomain")]}
      actionsBesideName
      disabled={() => busy}
      onToggle={onToggleFeature}
      {identity}
      {actions}
    />
  {/if}

  <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <Field label={$t("admin.domains.addLabel")} forId="allowed-domain" hint={$t("admin.domains.addHint")}>
      <TextInput
        id="allowed-domain"
        bind:value={newDomain}
        placeholder={$t("admin.domains.placeholder")}
        autocomplete="off"
        required
        disabled={busy}
      />
    </Field>
    <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend class="mb-2 p-0 text-sm font-medium text-content">{$t("admin.features.heading")}</legend>
      <FeatureSwitches
        {features}
        disabled={busy}
        onChange={(key, value) => (features = { ...features, [key]: value })}
      />
    </fieldset>
    <div>
      <Button type="submit" variant="outlined" loading={busy} class="w-full sm:w-auto">{$t("admin.domains.add")}</Button>
    </div>
  </form>
</div>
