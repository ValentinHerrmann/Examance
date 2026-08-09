<script lang="ts">
  export let isImporting: boolean;
  export let importStatus: string;
  export let onImportArchive: (event: Event) => void;
</script>

<div class="flex items-center justify-between mb-8">
  <div>
    <h2 class="m-0 text-[1.75rem] text-slate-50">Exams Dashboard</h2>
    <p class="m-0 mt-1.5 text-sm text-slate-400">Manage, grade, and analyze your Schulaufgabe exams</p>
  </div>
  <div class="flex items-center gap-4">
    <label
      for="importFile"
      class="cursor-pointer rounded-md bg-slate-700 px-5 py-2.5 font-semibold text-white hover:bg-slate-600"
    >
      {isImporting ? 'Importing...' : '📂 Import .bgproj'}
    </label>
    <input type="file" id="importFile" accept=".bgproj" on:change={onImportArchive} disabled={isImporting} hidden />
    <a
      href="/exam/new"
      class="rounded-md bg-sky-600 px-5 py-2.5 font-semibold text-white no-underline hover:bg-sky-700"
      >➕ Create New Exam</a
    >
  </div>
</div>

{#if importStatus}
  <div class="mb-6 rounded-md border border-sky-600 bg-slate-900 px-4 py-3 text-sm text-sky-400">{importStatus}</div>
{/if}
