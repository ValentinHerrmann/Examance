<script lang="ts">
  import { goto } from "$app/navigation";
  import "./+page.css";
  import { db } from "$lib/db/db";
  import { eraseStudent } from "$lib/gdpr/erasure";
  import { wipeDatabase } from "$lib/db/hygiene";
  import { sessionStore, isUnlocked, isAuthenticated } from "$lib/stores/session";
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
  import { exportStudentData, toDownloadableJson } from "$lib/gdpr/subjectAccess";
  import {
    locale,
    setLocale,
    t,
    translate,
    LOCALE_LABELS,
    type Locale,
  } from "$lib/i18n";

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

  onMount(async () => {
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

  async function handleStorageModeChange(val: StorageMode) {
    if (val === $storagePolicyStore.storageMode) return;

    if ((val === "all-server" || val === "hybrid") && !get(isAuthenticated)) {
      alert(translate("settings.alerts.serverStorageNeedsAuth"));
      window.location.href = "/unlock";
      return;
    }

    const confirmed = confirm(translate("settings.alerts.storageModeConfirm"));
    if (!confirmed) return;

    await wipeDatabase();
    storagePolicyStore.updateSetting("storageMode", val);
    statusMsg = translate("settings.status.storageModeSet", { mode: val });
    window.location.reload();
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
  <div class="settings-page">
    <h2>{$t("settings.pageTitle")}</h2>

    {#if statusMsg}
      <div class="settings-status-banner">{statusMsg}</div>
    {/if}

    <SettingsForm
      storageMode={$storagePolicyStore.storageMode}
      latexCompilation={$storagePolicyStore.latexCompilation}
      uiLocale={$locale}
      onStorageModeChange={handleStorageModeChange}
      onLatexChange={handleLatexChange}
      onLocaleChange={handleLocaleChange}
    />

    <GdprErasureTable
      {students}
      {isErasing}
      onErase={handleEraseStudent}
      onExport={handleExportStudent}
    />

    <div class="settings-card settings-danger-card">
      <h3>{$t("settings.hygiene.heading")}</h3>
      <p>{$t("settings.hygiene.description")}</p>
      <button class="settings-clear-btn" on:click={handleClearAllSessionData}
        >{$t("settings.hygiene.button")}</button
      >
    </div>
  </div>
{/if}
