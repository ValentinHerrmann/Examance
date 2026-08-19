<script lang="ts">
  import LegalPage from "$lib/components/legal/LegalPage.svelte";
  import { t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t("legal.impressum.pageTitle")}</title>
</svelte:head>

<LegalPage title={$t("legal.impressum.title")} subtitle={$t("legal.impressum.subtitle")}>
  <p class="todo-banner">
    <strong>{$t("legal.impressum.todoBanner.strong")}</strong>
    {$t("legal.impressum.todoBanner.text")}
  </p>

  <h2>{$t("legal.impressum.provider.heading")}</h2>
  <p>
    <span class="placeholder">{$t("legal.impressum.provider.namePlaceholder")}</span><br />
    <span class="placeholder">{$t("legal.impressum.provider.streetPlaceholder")}</span><br />
    <span class="placeholder">{$t("legal.impressum.provider.cityPlaceholder")}</span><br />
    {$t("legal.impressum.provider.country")}
  </p>

  <h2>{$t("legal.impressum.representative.heading")}</h2>
  <p>
    <span class="placeholder">{$t("legal.impressum.representative.namePlaceholder")}</span>
  </p>

  <h2>{$t("legal.impressum.contact.heading")}</h2>
  <p>
    {$t("legal.impressum.contact.phoneLabel")} <span class="placeholder">{$t("legal.impressum.contact.phonePlaceholder")}</span><br />
    {$t("legal.impressum.contact.emailLabel")} <span class="placeholder">{$t("legal.impressum.contact.emailPlaceholder")}</span>
  </p>

  <h2>{$t("legal.impressum.authority.heading")}</h2>
  <p>
    <span class="placeholder">{$t("legal.impressum.authority.placeholder")}</span>
  </p>

  <h2>{$t("legal.impressum.responsible.heading")}</h2>
  <p>
    <span class="placeholder">{$t("legal.impressum.responsible.placeholder")}</span>
  </p>

  <h2>{$t("legal.impressum.privacy.heading")}</h2>
  <p>
    {$t("legal.impressum.privacy.textBefore")}
    <a href="/legal/datenschutz">{$t("legal.impressum.privacy.linkText")}</a>.
  </p>
</LegalPage>
