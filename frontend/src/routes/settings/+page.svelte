<script lang="ts">
  import { goto } from "$app/navigation";
  import { db } from "$lib/db/db";
  import { eraseStudent } from "$lib/gdpr/erasure";
  import { wipeDatabase } from "$lib/db/hygiene";
  import { sessionStore, isUnlocked, isAuthenticated, awaitSessionReady } from "$lib/stores/session";
  import { studentRepository } from "$lib/repositories/studentRepository";
  import { get } from "svelte/store";
  import {
    storagePolicyStore,
    type StorageMode,
  } from "$lib/stores/storagePolicy";
  import type { StudentRecord } from "$lib/db/schema";
  import { onMount } from "svelte";
  import SettingsForm from "$lib/components/settings/SettingsForm.svelte";
  import GdprErasureTable from "$lib/components/settings/GdprErasureTable.svelte";
  import OmrDetectionSettingsCard from "$lib/components/settings/OmrDetectionSettingsCard.svelte";
  import { omrSettingsStore } from "$lib/stores/omrSettings";
  import OmrDonationCard from "$lib/components/settings/OmrDonationCard.svelte";
  import { trainingDonationStore } from "$lib/stores/trainingDonation";
  import { fetchDonationAvailable } from "$lib/services/trainingDonation";
  import { backendStore, extractHostname } from "$lib/stores/backendStore";
  import { exportStudentData, toDownloadableJson } from "$lib/gdpr/subjectAccess";
  import {
    locale,
    setLocale,
    t,
    translate,
    LOCALE_LABELS,
    type Locale,
  } from "$lib/i18n";
  import { PageShell, PageHeader, Card, Button } from "$lib/components/ui";
  import StorageModeSwitchWizard from "$lib/components/storage/StorageModeSwitchWizard.svelte";

  /** GDPR Art. 15 — hand the data subject a readable copy of their own data. */
  async function handleExportStudent(pseudonymId: string) {
    statusMsg = "";
    try {
      const data = await exportStudentData(pseudonymId);
      const url = URL.createObjectURL(toDownloadableJson(data));
      const link = document.createElement("a");
      link.href = url;
      link.download = `auskunft-${pseudonymId.slice(0, 8)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      statusMsg = translate("settings.status.exportDownloaded");
    } catch (err: any) {
      statusMsg = err?.message ?? translate("settings.status.exportFailed");
    }
  }

  let students: StudentRecord[] = [];
  let isErasing = false;
  let statusMsg = "";
  let isSwitchWizardOpen = false;
  let switchTarget: StorageMode | null = null;
  let donationAvailable = false;

  onMount(async () => {
    void fetchDonationAvailable().then((ok) => (donationAvailable = ok));
    await awaitSessionReady();
    if (!$isUnlocked) {
      // Keys are passphrase-derived and never persisted — send the user to
      // /unlock rather than silently reconstructing a session.
      await goto("/unlock");
      return;
    }
    const key = get(sessionStore).sessionKey;
    students = await studentRepository.getAll(key);
  });

  async function handleLatexChange(val: "server" | "local") {
    if (val === "server" && !get(isAuthenticated)) {
      alert(translate("settings.alerts.serverCompileNeedsAuth"));
      window.location.href = "/unlock";
      return;
    }
    storagePolicyStore.updateSetting("latexCompilation", val);
    statusMsg = translate("settings.status.latexSet", { mode: val });
  }

  /** Same gated storage-mode-switch wizard as the quick-config modal. */
  function handleStorageModeChange(val: StorageMode) {
    if (val === $storagePolicyStore.storageMode) return;
    switchTarget = val;
    isSwitchWizardOpen = true;
  }

  function handleSwitchWizardClosed() {
    isSwitchWizardOpen = false;
    switchTarget = null;
  }

  function handleLocaleChange(val: Locale) {
    if (val === $locale) return;
    setLocale(val);
    statusMsg = translate("settings.status.languageSet", {
      language: LOCALE_LABELS[val],
    });
  }

  async function handleEraseStudent(pseudonymId: string, examId: string) {
    if (!confirm(translate("settings.alerts.eraseStudentConfirm"))) return;
    isErasing = true;
    try {
      await eraseStudent(pseudonymId, examId);
      students = students.filter((s) => s.pseudonymId !== pseudonymId);
      statusMsg = translate("settings.status.studentErased", { id: pseudonymId });
    } catch (err: any) {
      alert(translate("settings.alerts.eraseFailed", { message: err.message }));
    } finally {
      isErasing = false;
    }
  }

  async function handleClearAllSessionData() {
    if (!confirm(translate("settings.hygiene.confirm"))) return;
    await wipeDatabase();
    sessionStore.lock();
    window.location.href = "/unlock";
  }
</script>

{#if $isUnlocked}
  <PageShell>
    <PageHeader title={$t("settings.pageTitle")} helpTopic="settings" />

    {#if statusMsg}
      <div class="mb-6 rounded-md bg-green-500/20 p-3 text-green-300">{statusMsg}</div>
    {/if}

    <SettingsForm
      storageMode={$storagePolicyStore.storageMode}
      latexCompilation={$storagePolicyStore.latexCompilation}
      uiLocale={$locale}
      onStorageModeChange={handleStorageModeChange}
      onLatexChange={handleLatexChange}
      onLocaleChange={handleLocaleChange}
    />

    <OmrDetectionSettingsCard
      profile={$omrSettingsStore}
      onSave={(params) => omrSettingsStore.save(params)}
      onReset={() => omrSettingsStore.reset()}
    />

    <OmrDonationCard
      enabled={$trainingDonationStore.enabled}
      available={donationAvailable}
      signedIn={$isAuthenticated}
      host={extractHostname($backendStore)}
      onChange={(enabled) => trainingDonationStore.setEnabled(enabled)}
    />

    {#if $isAuthenticated}
      <!-- Server accounts only: a local vault has no sign-in factors. -->
      <Card class="mb-8">
        <h3 class="m-0 mb-2 text-accent">{$t("security.page.title")}</h3>
        <p class="mt-0 mb-4 text-muted">{$t("security.page.subtitle")}</p>
        <Button variant="secondary" onClick={() => goto("/settings/security")}>
          {$t("security.page.open")}
        </Button>
      </Card>
    {/if}

    <GdprErasureTable
      {students}
      {isErasing}
      onErase={handleEraseStudent}
      onExport={handleExportStudent}
    />

    <Card tone="danger" class="mb-8">
      <h3 class="m-0 mb-2 text-accent">{$t("settings.hygiene.heading")}</h3>
      <p class="mt-0 mb-4 text-muted">{$t("settings.hygiene.description")}</p>
      <Button variant="danger" onClick={handleClearAllSessionData}>{$t("settings.hygiene.button")}</Button>
    </Card>
  </PageShell>
{/if}

<StorageModeSwitchWizard
  open={isSwitchWizardOpen}
  target={switchTarget}
  onClose={handleSwitchWizardClosed}
/>
