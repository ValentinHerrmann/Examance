<script lang="ts">
  import { goto } from "$app/navigation";
  import { db } from "#lib/db/db";
  import { eraseStudent } from "#lib/gdpr/erasure";
  import { wipeDatabase } from "#lib/db/hygiene";
  import { sessionStore, isUnlocked, isAuthenticated, awaitSessionReady } from "#lib/stores/session";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { get } from "svelte/store";
  import {
    storagePolicyStore,
    type StorageMode,
  } from "#lib/stores/storagePolicy";
  import type { StudentRecord } from "#lib/db/schema";
  import { onMount } from "svelte";
  import SettingsForm from "#lib/components/settings/SettingsForm.svelte";
  import GdprErasureTable from "#lib/components/settings/GdprErasureTable.svelte";
  import OmrDetectionSettingsCard from "#lib/components/settings/OmrDetectionSettingsCard.svelte";
  import { omrSettingsStore } from "#lib/stores/omrSettings";
  import OmrDonationCard from "#lib/components/settings/OmrDonationCard.svelte";
  import { trainingDonationStore } from "#lib/stores/trainingDonation";
  import { fetchDonationAvailable } from "#lib/services/trainingDonation";
  import { backendStore, extractHostname } from "#lib/stores/backendStore";
  import { exportStudentData, toDownloadableJson } from "#lib/gdpr/subjectAccess";
  import {
    locale,
    setLocale,
    t,
    translate,
    LOCALE_LABELS,
    type Locale,
  } from "#lib/i18n";
  import { PageShell, PageHeader, Card, Button, Alert } from "#lib/components/ui";
  import SectionNav from "#lib/components/settings/SectionNav.svelte";
  import StorageModeSwitchWizard from "#lib/components/storage/StorageModeSwitchWizard.svelte";
  import { currentManifest } from "#lib/db/workspace";

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

  let students: StudentRecord[] = $state.raw([]);
  let isErasing = $state(false);
  let statusMsg = $state("");
  let isSwitchWizardOpen = $state(false);
  // Who this browser's workspace is bound to (lib/db/workspace.ts); shown under the storage settings.
  let workspaceOwnerLabel = $state("");

  async function loadWorkspaceOwner() {
    const owner = (await currentManifest())?.owner;
    workspaceOwnerLabel = !owner
      ? translate("storagePolicy.workspace.ownerUnclaimed")
      : owner.kind === "local-vault"
        ? translate("storagePolicy.workspace.ownerLocalVault")
        : translate("storagePolicy.workspace.ownerAccount", {
            account: $sessionStore.email ?? owner.accountId ?? "?",
            server: extractHostname(owner.backendOrigin ?? ""),
          });
  }
  let switchTarget: StorageMode | null = $state(null);
  let donationAvailable = $state(false);

  onMount(async () => {
    void fetchDonationAvailable().then((ok) => (donationAvailable = ok));
    await awaitSessionReady();
    void loadWorkspaceOwner();
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
    // Compiling is a stateless service, not storage, so it is allowed with local data, but the exam's
    // LaTeX (including solutions) and its files do leave the device for it: say so once, on opt-in.
    if (
      val === "server" &&
      get(storagePolicyStore).storageMode === "all-local" &&
      !confirm(translate("storagePolicy.serverCompileConsent"))
    ) {
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

  let navItems = $derived([
    { id: "storage-policy", label: $t("settings.storage.heading") },
    { id: "latex", label: $t("settings.latex.heading") },
    { id: "language", label: $t("settings.language.heading") },
    { id: "theme", label: $t("settings.theme.heading") },
    { id: "omr", label: $t("settings.omr.heading") },
    ...(donationAvailable || $trainingDonationStore.enabled
      ? [{ id: "donation", label: $t("settings.donation.heading") }]
      : []),
    ...($isAuthenticated ? [{ id: "security", label: $t("security.page.title") }] : []),
    { id: "gdpr", label: $t("admin.gdprErasureTable.title") },
    { id: "hygiene", label: $t("settings.hygiene.heading") },
  ]);

  async function handleClearAllSessionData() {
    if (!confirm(translate("settings.hygiene.confirm"))) return;
    await wipeDatabase();
    sessionStore.lock();
    window.location.href = "/unlock";
  }
</script>

{#if $isUnlocked}
  <PageShell width="wide">
    <PageHeader title={$t("settings.pageTitle")} helpTopic="settings" />

    <div class="lg:flex lg:items-start lg:gap-8">
      <SectionNav items={navItems} ariaLabel={$t("settings.pageTitle")} />

      <div class="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
        {#if statusMsg}
          <Alert severity="success" onDismiss={() => (statusMsg = "")}>{statusMsg}</Alert>
        {/if}

        <SettingsForm
          storageMode={$storagePolicyStore.storageMode}
          latexCompilation={$storagePolicyStore.latexCompilation}
          uiLocale={$locale}
          onStorageModeChange={handleStorageModeChange}
          onLatexChange={handleLatexChange}
          onLocaleChange={handleLocaleChange}
        />
        {#if workspaceOwnerLabel}
          <p class="-mt-2 px-1 text-xs text-muted">
            {$t("storagePolicy.workspace.ownerLabel")}: {workspaceOwnerLabel}
          </p>
        {/if}

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
          <div id="security" class="scroll-mt-16 lg:scroll-mt-4">
            <Card title={$t("security.page.title")}>
              <p class="mt-0 mb-4 text-sm text-muted">{$t("security.page.subtitle")}</p>
              <Button variant="outlined" severity="secondary" onClick={() => goto("/settings/security")}>
                {$t("security.page.open")}
              </Button>
            </Card>
          </div>
        {/if}

        <div id="gdpr" class="scroll-mt-16 lg:scroll-mt-4">
          <GdprErasureTable
            {students}
            {isErasing}
            onErase={handleEraseStudent}
            onExport={handleExportStudent}
          />
        </div>

        <div id="hygiene" class="scroll-mt-16 lg:scroll-mt-4">
          <Card tone="danger" title={$t("settings.hygiene.heading")}>
            <p class="mt-0 mb-4 text-sm text-muted">{$t("settings.hygiene.description")}</p>
            <Button severity="danger" onClick={handleClearAllSessionData}>{$t("settings.hygiene.button")}</Button>
          </Card>
        </div>
      </div>
    </div>
  </PageShell>
{/if}

<StorageModeSwitchWizard
  open={isSwitchWizardOpen}
  target={switchTarget}
  onClose={handleSwitchWizardClosed}
/>
