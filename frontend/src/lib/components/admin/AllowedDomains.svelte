<script lang="ts">
  // Always-allowed domains (issue #53): a verified registration from a listed domain is approved on the
  // spot with that domain's features. Changes apply to future registrations only.
  import { faTrash } from "@fortawesome/free-solid-svg-icons";
  import {
    ACCOUNT_FEATURES,
    ALL_FEATURES_ON,
    FEATURE_COLUMNS,
    type AccountFeature,
    type AccountFeatures,
    type AllowedDomain,
  } from "#lib/api/admin";
  import { t } from "#lib/i18n";
  import { Alert, Button, Field, Switch, TableScroller, TextInput } from "#lib/components/ui";
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

<div class="flex min-w-0 flex-col gap-4">
  <Alert severity="warning">{$t("admin.domains.warning")}</Alert>

  {#if domains.length === 0}
    <p class="m-0 text-sm text-muted">{$t("admin.domains.empty")}</p>
  {:else}
    <!-- Phones and small tablets: one row per domain. -->
    <ul class="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
      {#each domains as domain (domain.id)}
        <li class="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface-base p-4">
          <div class="flex min-w-0 items-center justify-between gap-2">
            <strong class="min-w-0 break-words text-content">@{domain.domain}</strong>
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
          </div>
          <FeatureSwitches
            features={domain.features}
            disabled={busy}
            compact
            onChange={(key, value) => onToggleFeature(domain, key, value)}
          />
        </li>
      {/each}
    </ul>

    <!-- From md: the table. -->
    <div class="hidden min-w-0 md:block">
    <TableScroller label={$t("admin.domains.title")}>
      <table class="data-table data-table-compact w-full">
        <thead>
          <tr>
            <th>{$t("admin.domains.columnDomain")}</th>
            {#each ACCOUNT_FEATURES as key (key)}
              <th>{$t(FEATURE_COLUMNS[key])}</th>
            {/each}
            <th><span class="sr-only">{$t("admin.accounts.columnActions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each domains as domain (domain.id)}
            <tr>
              <td class="break-words text-content">@{domain.domain}</td>
              {#each ACCOUNT_FEATURES as key (key)}
                <td>
                  <Switch
                    checked={domain.features[key]}
                    disabled={busy}
                    ariaLabel={`${$t(FEATURE_COLUMNS[key])}: ${domain.domain}`}
                    onChange={(value) => onToggleFeature(domain, key, value)}
                  />
                </td>
              {/each}
              <td class="text-right">
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
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>
    </div>
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
