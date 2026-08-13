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
      alert("Server compilation requires an authenticated session. Please log in.");
      window.location.href = "/unlock";
      return;
    }
    storagePolicyStore.updateSetting("latexCompilation", val);
    statusMsg = `LaTeX Compilation set to ${val}.`;
  }

  async function handleStorageModeChange(val: StorageMode) {
    if (val === $storagePolicyStore.storageMode) return;

    if ((val === "all-server" || val === "hybrid") && !get(isAuthenticated)) {
      alert("Server storage modes require an authenticated session. Please log in.");
      window.location.href = "/unlock";
      return;
    }

    const confirmed = confirm(
      "Changing storage mode requires clearing the current active session state. Please make sure you have exported a .bgproj backup first!\n\nDo you want to proceed and switch storage mode?"
    );
    if (!confirmed) return;

    await wipeDatabase();
    storagePolicyStore.updateSetting("storageMode", val);
    statusMsg = `Global Storage Mode updated to ${val}. Session cleared.`;
    window.location.reload();
  }

  async function handleEraseStudent(pseudonymId: string, examId: string) {
    if (
      !confirm(
        "Are you sure you want to permanently erase this student identity and all submissions?",
      )
    )
      return;
    isErasing = true;
    try {
      await eraseStudent(pseudonymId, examId);
      students = students.filter((s) => s.pseudonymId !== pseudonymId);
      statusMsg = `Student ${pseudonymId} successfully erased.`;
    } catch (err: any) {
      alert(`Erasure failed: ${err.message}`);
    } finally {
      isErasing = false;
    }
  }

  async function handleClearAllSessionData() {
    if (!confirm("Wipe all local session data from IndexedDB?")) return;
    await wipeDatabase();
    sessionStore.lock();
    window.location.href = "/unlock";
  }
</script>

{#if $isUnlocked}
  <div class="settings-page">
    <h2>Settings & Privacy Configuration</h2>

    {#if statusMsg}
      <div class="settings-status-banner">{statusMsg}</div>
    {/if}

    <SettingsForm
      storageMode={$storagePolicyStore.storageMode}
      latexCompilation={$storagePolicyStore.latexCompilation}
      onStorageModeChange={handleStorageModeChange}
      onLatexChange={handleLatexChange}
    />

    <GdprErasureTable
      {students}
      {isErasing}
      onErase={handleEraseStudent}
    />

    <div class="settings-card settings-danger-card">
      <h3>Session Data Hygiene</h3>
      <p>
        Permanently clear all cached exam, student, and scan data from local
        browser storage.
      </p>
      <button class="settings-clear-btn" on:click={handleClearAllSessionData}
        >Clear All Session Data</button
      >
    </div>
  </div>
{/if}
