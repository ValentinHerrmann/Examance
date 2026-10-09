<script lang="ts">
  import LegalPage from "#lib/components/legal/LegalPage.svelte";
  import OperatorDetails from "#lib/components/legal/OperatorDetails.svelte";
  import { t } from "#lib/i18n";
</script>

<svelte:head>
  <title>{$t("legal.impressum.pageTitle")}</title>
</svelte:head>

<LegalPage title={$t("legal.impressum.title")} subtitle={$t("legal.impressum.subtitle")}>
  <h2>{$t("legal.impressum.provider.heading")}</h2>
  <OperatorDetails />

  <h2>{$t("legal.impressum.privacy.heading")}</h2>
  <p>
    {$t("legal.impressum.privacy.textBefore")}
    <a href="/legal/datenschutz" class="link">{$t("legal.impressum.privacy.linkText")}</a>.
  </p>
</LegalPage>
