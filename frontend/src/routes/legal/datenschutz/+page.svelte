<script lang="ts">
  import { onMount } from "svelte";
  import LegalPage from "#lib/components/legal/LegalPage.svelte";
  import OperatorDetails from "#lib/components/legal/OperatorDetails.svelte";
  import { t } from "#lib/i18n";
  import { fetchRetentionPeriods, type RetentionPeriods } from "#lib/legal/retentionPeriods";

  /** Null while loading or when the backend is unreachable: section 9 then states the criteria instead. */
  let periods: RetentionPeriods | null = $state.raw(null);
  onMount(() => {
    void fetchRetentionPeriods().then((p) => (periods = p));
  });
</script>

<svelte:head>
  <title>{$t("legal.datenschutz.pageTitle")}</title>
</svelte:head>

<LegalPage title={$t("legal.datenschutz.title")} subtitle={$t("legal.datenschutz.subtitle")}>
  <h2>{$t("legal.datenschutz.section1.heading")}</h2>
  <p>{$t("legal.datenschutz.section1.text")}</p>
  <OperatorDetails />

  <h2>{$t("legal.datenschutz.section2.heading")}</h2>
  <p>{$t("legal.datenschutz.section2.para1")}</p>
  <p>{$t("legal.datenschutz.section2.para2")}</p>
  <p>{$t("legal.datenschutz.section2.para3")}</p>

  <h2>{$t("legal.datenschutz.section3.heading")}</h2>
  <p>{$t("legal.datenschutz.section3.para1")}</p>
  <p>{$t("legal.datenschutz.section3.para2")}</p>
  <p>{$t("legal.datenschutz.section3.para3")}</p>

  <h2>{$t("legal.datenschutz.section4.heading")}</h2>
  <p>{$t("legal.datenschutz.section4.para1")}</p>
  <p>{$t("legal.datenschutz.section4.para2")}</p>
  <p>{$t("legal.datenschutz.section4.para3")}</p>

  <h2>{$t("legal.datenschutz.section5.heading")}</h2>
  <p>{$t("legal.datenschutz.section5.intro")}</p>
  <ul>
    <li>
      <strong>{$t("legal.datenschutz.section5.sharingLabel")}</strong>
      {$t("legal.datenschutz.section5.sharingText")}
    </li>
    <li>
      <strong>{$t("legal.datenschutz.section5.donationLabel")}</strong>
      {$t("legal.datenschutz.section5.donationText")}
    </li>
  </ul>

  <h2>{$t("legal.datenschutz.section6.heading")}</h2>
  <p>{$t("legal.datenschutz.section6.text")}</p>

  <h2>{$t("legal.datenschutz.section7.heading")}</h2>
  <p>{$t("legal.datenschutz.section7.text")}</p>

  <h2>{$t("legal.datenschutz.section8.heading")}</h2>
  <p>{$t("legal.datenschutz.section8.text")}</p>

  <h2>{$t("legal.datenschutz.section9.heading")}</h2>
  <p>{$t("legal.datenschutz.section9.intro")}</p>
  <ul>
    <li>{$t("legal.datenschutz.section9.account")}</li>
    {#if periods}
      <li>{$t("legal.datenschutz.section9.students", { graceDays: periods.graceDays })}</li>
      <li>
        {$t("legal.datenschutz.section9.registration", {
          registrationLinkHours: periods.registrationLinkHours,
          pendingAccountDays: periods.pendingAccountDays,
        })}
      </li>
      <li>{$t("legal.datenschutz.section9.auditLog", { auditLogDays: periods.auditLogDays })}</li>
      <li>
        {$t("legal.datenschutz.section9.contributions", {
          contributionDays: periods.contributionDays,
          contributionPendingDays: periods.contributionPendingDays,
        })}
      </li>
      <li>{$t("legal.datenschutz.section9.donation", { trainingSampleDays: periods.trainingSampleDays })}</li>
    {/if}
    <li>{$t("legal.datenschutz.section9.counters")}</li>
    <li>{$t("legal.datenschutz.section9.serverLog")}</li>
    <li>{$t("legal.datenschutz.section9.browser")}</li>
  </ul>
  {#if !periods}
    <p>{$t("legal.datenschutz.section9.fallback")}</p>
  {/if}

  <h2>{$t("legal.datenschutz.section10.heading")}</h2>
  <p>{$t("legal.datenschutz.section10.para1")}</p>
  <p>{$t("legal.datenschutz.section10.para2")}</p>

  <h2>{$t("legal.datenschutz.section11.heading")}</h2>
  <p>{$t("legal.datenschutz.section11.para1")}</p>
  <p>{$t("legal.datenschutz.section11.para2")}</p>
</LegalPage>
