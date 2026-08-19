<script lang="ts">
  import LegalPage from "$lib/components/legal/LegalPage.svelte";
  import { t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t("legal.datenschutz.pageTitle")}</title>
</svelte:head>

<LegalPage
  title={$t("legal.datenschutz.title")}
  subtitle={$t("legal.datenschutz.subtitle")}
>
  <p class="todo-banner">
    <strong>{$t("legal.datenschutz.todoBanner.strong")}</strong>
    {$t("legal.datenschutz.todoBanner.text")}
    <code>docs/legal_audit_dsgvo.md</code>.
  </p>

  <h2>{$t("legal.datenschutz.section1.heading")}</h2>
  <p>
    <span class="placeholder">{$t("legal.datenschutz.section1.text")}</span>
  </p>

  <h2>{$t("legal.datenschutz.section2.heading")}</h2>
  <p>
    <span class="placeholder">{$t("legal.datenschutz.section2.text")}</span>
  </p>

  <h2>{$t("legal.datenschutz.section3.heading")}</h2>
  <p>
    {$t("legal.datenschutz.section3.para1Before")}
    <span class="placeholder">{$t("legal.datenschutz.section3.para1Placeholder")}</span>.
  </p>
  <p>
    {$t("legal.datenschutz.section3.para2")}
  </p>

  <h2>{$t("legal.datenschutz.section4.heading")}</h2>
  <ul>
    <li>{$t("legal.datenschutz.section4.li1")}</li>
    <li>{$t("legal.datenschutz.section4.li2")}</li>
  </ul>

  <h2>{$t("legal.datenschutz.section5.heading")}</h2>
  <p>
    {$t("legal.datenschutz.section5.para1Before")}<em>{$t("legal.datenschutz.section5.para1Emphasis")}</em>{$t("legal.datenschutz.section5.para1After")}
  </p>
  <p>
    {$t("legal.datenschutz.section5.para2")}
  </p>

  <h2>{$t("legal.datenschutz.section6.heading")}</h2>
  <ul>
    <li>{$t("legal.datenschutz.section6.hostingWebLabel")} <span class="placeholder">{$t("legal.datenschutz.section6.hostingWebPlaceholder")}</span></li>
    <li>{$t("legal.datenschutz.section6.hostingDbLabel")} <span class="placeholder">{$t("legal.datenschutz.section6.hostingDbPlaceholder")}</span></li>
  </ul>

  <h2>{$t("legal.datenschutz.section7.heading")}</h2>
  <p>
    {$t("legal.datenschutz.section7.textBefore")}
    <span class="placeholder">{$t("legal.datenschutz.section7.gracePlaceholder")}</span>
    {$t("legal.datenschutz.section7.textMiddle")}
    <span class="placeholder">{$t("legal.datenschutz.section7.auditPlaceholder")}</span>
    {$t("legal.datenschutz.section7.textEnd")}
  </p>

  <h2>{$t("legal.datenschutz.section8.heading")}</h2>
  <p>
    {$t("legal.datenschutz.section8.text")}
  </p>

  <h2>{$t("legal.datenschutz.section9.heading")}</h2>
  <p>
    {$t("legal.datenschutz.section9.textBefore")}
    <span class="placeholder">{$t("legal.datenschutz.section9.placeholder")}</span>.
  </p>
</LegalPage>
