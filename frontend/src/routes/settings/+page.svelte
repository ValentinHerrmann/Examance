<script lang="ts">
  import { goto } from "$app/navigation";
  import { db } from "#lib/db/db";
  import { eraseStudent } from "#lib/gdpr/erasure";
  import { wipeDatabase } from "#lib/db/hygiene";
  import { sessionStore, isUnlocked, isAuthenticated, awaitSessionReady } from "#lib/stores/session";
  import { examRepository } from "#lib/repositories/examRepository";
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
  import RestoreServerDataCard from "#lib/components/settings/RestoreServerDataCard.svelte";
  import AccountLogoCard from "#lib/components/logo/AccountLogoCard.svelte";
  import AccountPackagesCard from "#lib/components/latex-packages/AccountPackagesCard.svelte";
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
  import SecuritySection from "#lib/components/security/SecuritySection.svelte";
  import SettingsGroupHeading from "#lib/components/settings/SettingsGroupHeading.svelte";
  import DeleteAccountCard from "#lib/components/settings/DeleteAccountCard.svelte";
  import BackendUrlCard from "#lib/components/settings/BackendUrlCard.svelte";
  import { requestedModeSwitch } from "#lib/services/storageModeSwitch";
  import { currentManifest, refreshCapabilities } from "#lib/db/workspace";
  import { allowedStorageModes, effectiveLatexStore, featuresStore } from "#lib/stores/capabilities";

  /** GDPR Art. 15 — hand the data subject a readable copy of their own data. */
  async function handleExportStudent(pseudonymId: string, examId: string) {
    statusMsg = "";
    try {
      const data = await exportStudentData(pseudonymId, examId);
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
  let gdprLoadError = $state("");
  let studentExams: { id: string; title: string }[] = $state.raw([]);
  let isErasing = $state(false);
  let statusMsg = $state("");
  // Who this browser's workspace is bound to (lib/db/workspace.ts); shown under the storage settings.
  let workspaceOwnerLabel = $state("");

  async function loadWorkspaceOwner() {
    const owner = (await currentManifest())?.owner;
    workspaceOwnerLabel = !owner
      ? ""
      : translate("storagePolicy.workspace.ownerAccount", {
          account: $sessionStore.email ?? owner.accountEmail ?? owner.accountId ?? "?",
          server: extractHostname(owner.backendOrigin ?? ""),
        });
  }
  let donationAvailable = $state(false);
  // Admins hold no exams or results (issue #58): only language, theme, security and account deletion apply.
  let isAdmin = $derived($sessionStore.role === "admin");

  onMount(async () => {
    void fetchDonationAvailable().then((ok) => (donationAvailable = ok));
    await awaitSessionReady();
    void loadWorkspaceOwner();
    // The options below follow the account's switches, which an admin may have just changed.
    void refreshCapabilities();
    if (!$isUnlocked) {
      // Keys come from the account sign-in and are never persisted — send the user to /unlock.
      await goto("/unlock");
      return;
    }
    if (isAdmin) return;
    const key = get(sessionStore).sessionKey;
    try {
      students = await studentRepository.getAll(key);
      const exams = await examRepository.getAll(key);
      studentExams = exams.map((e) => ({ id: e.id, title: e.title || e.id }));
    } catch (err) {
      // The table must not claim "no students stored" for a failed read.
      students = [];
      gdprLoadError = translate("admin.gdprErasureTable.loadFailed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  function handleLatexChange(val: "server" | "local") {
    // The option is disabled when the account may not compile on the server; this guards the handler too.
    if (val === "server" && !$featuresStore.server_latex) return;
    storagePolicyStore.updateSetting("latexCompilation", val);
    statusMsg = translate("settings.status.latexSet", { mode: val });
  }

  /** The root layout's move dialog carries the results over before the mode changes. */
  function handleStorageModeChange(val: StorageMode) {
    if (val === $storagePolicyStore.storageMode || !$allowedStorageModes.includes(val)) return;
    requestedModeSwitch.set(val);
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
      const result = await eraseStudent(pseudonymId, examId);
      students = students.filter((s) => s.pseudonymId !== pseudonymId);
      statusMsg = translate(
        result.status === "pending" ? "settings.status.studentErasurePending" : "settings.status.studentErased",
        { id: pseudonymId },
      );
    } catch (err: any) {
      alert(translate("settings.alerts.eraseFailed", { message: err.message }));
    } finally {
      isErasing = false;
    }
  }

  // Ordered by assumed frequency of use within each group, most used first.
  let navItems = $derived([
    ...(isAdmin ? [] : [
      { id: "group-workspace", label: $t("settings.groups.workspace"), group: true },
      { id: "latex", label: $t("settings.latex.heading") },
      { id: "omr", label: $t("settings.omr.heading") },
      { id: "logo", label: $t("logo.account.heading") },
      { id: "latex-packages", label: $t("latexPackages.account.heading") },
      { id: "storage-policy", label: $t("settings.storage.heading") },
      ...(donationAvailable || $trainingDonationStore.enabled
        ? [{ id: "donation", label: $t("settings.donation.heading") }]
        : []),
    ]),
    { id: "group-general", label: $t("settings.groups.general"), group: true },
    { id: "language", label: $t("settings.language.heading") },
    { id: "theme", label: $t("settings.theme.heading") },
    { id: "backend", label: $t("settings.backend.heading") },
    { id: "group-account", label: $t("settings.groups.account"), group: true },
    ...($isAuthenticated ? [{ id: "security", label: $t("security.page.title") }] : []),
    ...(isAdmin ? [] : [
      { id: "gdpr", label: $t("admin.gdprErasureTable.title") },
      { id: "hygiene", label: $t("settings.hygiene.heading") },
    ]),
    ...($isAuthenticated ? [{ id: "delete-account", label: $t("settings.deleteAccount.heading") }] : []),
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

      <div class="flex min-w-0 flex-1 flex-col gap-4">
        {#if statusMsg}
          <Alert severity="success" onDismiss={() => (statusMsg = "")}>{statusMsg}</Alert>
        {/if}

        {#if !isAdmin}
        <SettingsGroupHeading id="group-workspace" title={$t("settings.groups.workspace")} />

        <SettingsForm
          part="latex"
          storageMode={$storagePolicyStore.storageMode}
          latexCompilation={$effectiveLatexStore}
          uiLocale={$locale}
          onStorageModeChange={handleStorageModeChange}
          onLatexChange={handleLatexChange}
          onLocaleChange={handleLocaleChange}
          allowedModes={$allowedStorageModes}
          serverLatexEnabled={$featuresStore.server_latex === true}
        />

        <OmrDetectionSettingsCard
          profile={$omrSettingsStore}
          onSave={(params) => omrSettingsStore.save(params)}
          onReset={() => omrSettingsStore.reset()}
        />

        <AccountLogoCard />
        <AccountPackagesCard />

        <SettingsForm
          part="storage"
          storageMode={$storagePolicyStore.storageMode}
          latexCompilation={$effectiveLatexStore}
          uiLocale={$locale}
          onStorageModeChange={handleStorageModeChange}
          onLatexChange={handleLatexChange}
          onLocaleChange={handleLocaleChange}
          allowedModes={$allowedStorageModes}
          serverLatexEnabled={$featuresStore.server_latex === true}
        />
        {#if workspaceOwnerLabel}
          <p class="px-1 text-xs text-muted">
            {$t("storagePolicy.workspace.ownerLabel")}: {workspaceOwnerLabel}
          </p>
        {/if}

        <!-- Same rule as the server's result-write gate: server results allowed, or the account still in all-server. -->
        {#if $allowedStorageModes.includes("all-server") || $storagePolicyStore.storageMode === "all-server"}
          <RestoreServerDataCard hybrid={$storagePolicyStore.storageMode === "hybrid"} />
        {/if}

        <OmrDonationCard
          enabled={$trainingDonationStore.enabled}
          available={donationAvailable && $featuresStore.training_donation === true}
          signedIn={$isAuthenticated}
          host={extractHostname($backendStore)}
          onChange={(enabled) => trainingDonationStore.setEnabled(enabled)}
        />
        {/if}

        <SettingsGroupHeading id="group-general" title={$t("settings.groups.general")} />

        <SettingsForm
          part="general"
          storageMode={$storagePolicyStore.storageMode}
          latexCompilation={$effectiveLatexStore}
          uiLocale={$locale}
          onStorageModeChange={handleStorageModeChange}
          onLatexChange={handleLatexChange}
          onLocaleChange={handleLocaleChange}
          allowedModes={$allowedStorageModes}
          serverLatexEnabled={$featuresStore.server_latex === true}
        />

        <BackendUrlCard />

        <SettingsGroupHeading id="group-account" title={$t("settings.groups.account")} />

        {#if $isAuthenticated}
          <SecuritySection />
        {/if}

        {#if !isAdmin}
        <div id="gdpr" class="scroll-mt-16 lg:scroll-mt-4">
          <GdprErasureTable
            {students}
            exams={studentExams}
            loadError={gdprLoadError}
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
        {/if}

        {#if $isAuthenticated}
          <div id="delete-account" class="scroll-mt-16 lg:scroll-mt-4">
            <DeleteAccountCard email={$sessionStore.email ?? ""} />
          </div>
        {/if}
      </div>
    </div>
  </PageShell>
{/if}
