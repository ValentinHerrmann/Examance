<script lang="ts">
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
      await sessionStore.initAnonymousSession();
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
      <div class="status-banner">{statusMsg}</div>
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

    <div class="card danger-card">
      <h3>Session Data Hygiene</h3>
      <p>
        Permanently clear all cached exam, student, and scan data from local
        browser storage.
      </p>
      <button class="clear-btn" on:click={handleClearAllSessionData}
        >Clear All Session Data</button
      >
    </div>
  </div>
{/if}



<style>
  .settings-page {
    padding: 2rem;
    width: 100%;
    box-sizing: border-box;
  }

  h2 {
    color: #38bdf8;
  }

  .card {
    background: #1e293b;
    padding: 1.5rem;
    border-radius: 10px;
    margin-bottom: 2rem;
    border: 1px solid #334155;
  }

  .danger-card {
    border-color: #ef4444;
  }

  .clear-btn {
    background: #dc2626;
    color: white;
    font-weight: 600;
    border: none;
    padding: 0.75rem 1.25rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .status-banner {
    background: rgba(34, 197, 94, 0.2);
    color: #86efac;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
  }

  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    background: #1e293b;
    border: 1px solid #38bdf8;
    border-radius: 12px;
    padding: 1.5rem 2rem;
    max-width: 550px;
    width: 90%;
    color: #f8fafc;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .modal-card h3 {
    margin-top: 0;
    color: #38bdf8;
  }

  .counts-list {
    background: #0f172a;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    border: 1px solid #334155;
  }

  .counts-list li {
    margin-bottom: 0.25rem;
  }

  .modal-note {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .retention-notice {
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid #eab308;
    color: #fef08a;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .retention-notice ul {
    margin: 0.5rem 0 0 0;
    padding-left: 1.25rem;
  }

  .password-field {
    margin: 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .password-field label {
    font-size: 0.875rem;
    color: #cbd5e1;
  }

  .password-field input {
    background: #0f172a;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 0.6rem 0.75rem;
    border-radius: 6px;
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  .primary-btn {
    background: #0284c7;
    color: white;
    font-weight: 600;
    border: none;
    padding: 0.6rem 1rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .danger-btn {
    background: #dc2626;
    color: white;
    font-weight: 600;
    border: none;
    padding: 0.6rem 1rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .secondary-btn {
    background: #334155;
    color: #f8fafc;
    border: none;
    padding: 0.6rem 1rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .modal-divider {
    border: none;
    border-top: 1px solid #334155;
    margin: 1.25rem 0;
  }

  .restore-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .restore-hint {
    font-size: 0.8rem;
    color: #94a3b8;
    margin: 0;
  }

  .restore-btn {
    background: transparent;
    border: 1px solid #38bdf8;
    color: #38bdf8;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .progress-status {
    color: #38bdf8;
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }
</style>
