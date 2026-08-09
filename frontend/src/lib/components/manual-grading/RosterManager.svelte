<script lang="ts">
  import "./RosterManager.css";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { studentRepository } from "$lib/repositories/studentRepository";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { saveSubmissionEncrypted } from "$lib/db/dbEncryption";
  import { buildSubmissionMap } from "$lib/utils/studentLookup";
  import type { StudentRecord, SubmissionRecord } from "$lib/db/schema";

  export let examId: string;
  export let students: StudentRecord[] = [];
  export let submissions: SubmissionRecord[] = [];
  export let onRosterChanged: () => void = () => {};

  let newName = "";
  let newStudentNumber = "";
  let newFallbackCode = "";
  let showBulk = false;
  let bulkText = "";

  let editingPseudonymId: string | null = null;
  let editName = "";
  let editStudentNumber = "";

  let submissionMap = new Map<string, SubmissionRecord>();
  $: {
    buildSubmissionMap(submissions, students).then((m) => {
      submissionMap = m;
    });
  }

  async function handleAddSingle() {
    if (!newName.trim()) return;
    const key = get(sessionStore).sessionKey;
    const pseudonymId = crypto.randomUUID();

    const student: StudentRecord = {
      pseudonymId,
      examId,
      studentName: newName.trim(),
      studentNumber: newStudentNumber.trim() || undefined,
      fallbackCode: newFallbackCode.trim() || undefined,
      piiCt: new Uint8Array(0),
      piiIv: new Uint8Array(12),
    };
    await studentRepository.save(student, key);

    const sub: SubmissionRecord = {
      id: crypto.randomUUID(),
      examId,
      pseudonymHash: pseudonymId,
      createdAt: new Date().toISOString(),
    };
    await saveSubmissionEncrypted(sub, key);

    newName = "";
    newStudentNumber = "";
    newFallbackCode = "";
    onRosterChanged();
  }

  async function handleAddBulk() {
    if (!bulkText.trim()) return;
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const key = get(sessionStore).sessionKey;

    for (const line of lines) {
      const parts = line.split(/[\t;,]/).map((p) => p.trim());
      const studentName = parts[0];
      if (!studentName) continue;
      const studentNumber = parts[1] || undefined;
      const pseudonymId = crypto.randomUUID();

      const student: StudentRecord = {
        pseudonymId,
        examId,
        studentName,
        studentNumber,
        piiCt: new Uint8Array(0),
        piiIv: new Uint8Array(12),
      };
      await studentRepository.save(student, key);

      const sub: SubmissionRecord = {
        id: crypto.randomUUID(),
        examId,
        pseudonymHash: pseudonymId,
        createdAt: new Date().toISOString(),
      };
      await saveSubmissionEncrypted(sub, key);
    }

    bulkText = "";
    showBulk = false;
    onRosterChanged();
  }

  function startEdit(st: StudentRecord) {
    editingPseudonymId = st.pseudonymId;
    editName = st.studentName || "";
    editStudentNumber = st.studentNumber || "";
  }

  async function saveEdit(st: StudentRecord) {
    if (!editName.trim()) return;
    const key = get(sessionStore).sessionKey;
    const updated: StudentRecord = {
      ...st,
      studentName: editName.trim(),
      studentNumber: editStudentNumber.trim() || undefined,
    };
    await studentRepository.save(updated, key);
    editingPseudonymId = null;
    onRosterChanged();
  }

  function cancelEdit() {
    editingPseudonymId = null;
  }

  async function handleDelete(st: StudentRecord) {
    if (!confirm(`Delete student "${st.studentName || st.studentNumber || st.pseudonymId}"? This will also remove any scores for this student.`)) {
      return;
    }
    const key = get(sessionStore).sessionKey;
    const sub = submissionMap.get(st.pseudonymId);
    if (sub) {
      await submissionRepository.delete(examId, sub.id);
    }
    await studentRepository.delete(examId, st.pseudonymId);
    onRosterChanged();
  }
</script>

<div class="roster-manager">
  <div class="roster-add-card">
    <h3>➕ Add Student to Roster</h3>
    <form on:submit|preventDefault={handleAddSingle} class="roster-form-row">
      <div class="roster-form-field">
        <label for="student-name">Student Name (e.g. "Musterfrau, Karin")</label>
        <input
          id="student-name"
          type="text"
          bind:value={newName}
          placeholder="Name"
          required
        />
      </div>
      <div class="roster-form-field">
        <label for="student-number">Student ID / Matrikel-Nr (Optional)</label>
        <input
          id="student-number"
          type="text"
          bind:value={newStudentNumber}
          placeholder="123456"
        />
      </div>
      <div class="roster-form-field">
        <label for="fallback-code">Fallback Code (Optional)</label>
        <input
          id="fallback-code"
          type="text"
          bind:value={newFallbackCode}
          placeholder="ABC1"
        />
      </div>
      <button type="submit" class="roster-add-btn">Add Student</button>
    </form>

    <button
      class="roster-bulk-toggle"
      on:click={() => (showBulk = !showBulk)}
    >
      {showBulk ? "Hide Bulk Paste" : "📋 Paste Roster List (Multiple Students)"}
    </button>

    {#if showBulk}
      <div class="roster-bulk-box">
        <p style="font-size: 0.8rem; color: #94a3b8; margin: 0;">
          Paste list of students, one per line (Format: <code>Name [Tab or Comma] StudentNumber</code>):
        </p>
        <textarea
          bind:value={bulkText}
          placeholder={"Musterfrau, Karin\t12345\nMustermann, Peter\t67890\n ..."}
        ></textarea>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button class="roster-action-btn" on:click={() => (showBulk = false)}>Cancel</button>
          <button class="roster-add-btn" on:click={handleAddBulk}>Import Roster Lines</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="roster-table-container">
    {#if students.length === 0}
      <div class="roster-empty-state">
        No students in this exam yet. Add a student above or import from Excel.
      </div>
    {:else}
      <table class="roster-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Student Name</th>
            <th>Student ID / Number</th>
            <th>Pseudonym / Code</th>
            <th>Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each students as st, i (st.pseudonymId)}
            {@const sub = submissionMap.get(st.pseudonymId)}
            {@const isScanned = !!(sub?.scanCt || sub?.scanIv)}
            <tr>
              <td>{i + 1}</td>
              <td>
                {#if editingPseudonymId === st.pseudonymId}
                  <input
                    type="text"
                    bind:value={editName}
                    style="padding: 0.2rem 0.4rem; background: #0f172a; border: 1px solid #0284c7; color: white; border-radius: 4px;"
                  />
                {:else}
                  <strong>{st.studentName || "(Unnamed)"}</strong>
                {/if}
              </td>
              <td>
                {#if editingPseudonymId === st.pseudonymId}
                  <input
                    type="text"
                    bind:value={editStudentNumber}
                    style="padding: 0.2rem 0.4rem; background: #0f172a; border: 1px solid #0284c7; color: white; border-radius: 4px;"
                  />
                {:else}
                  {st.studentNumber || "-"}
                {/if}
              </td>
              <td>
                <span style="font-family: monospace; font-size: 0.8rem; color: #94a3b8;">
                  {st.fallbackCode || st.pseudonymId.slice(0, 8)}
                </span>
              </td>
              <td>
                {#if isScanned}
                  <span class="roster-badge scanned">QR Scanned</span>
                {:else}
                  <span class="roster-badge manual">Manual</span>
                {/if}
              </td>
              <td>
                {#if editingPseudonymId === st.pseudonymId}
                  <button class="roster-action-btn" on:click={() => saveEdit(st)}>Save</button>
                  <button class="roster-action-btn" on:click={cancelEdit}>Cancel</button>
                {:else}
                  <button class="roster-action-btn" on:click={() => startEdit(st)}>Edit</button>
                  <button class="roster-action-btn delete" on:click={() => handleDelete(st)}>Delete</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
