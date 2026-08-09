<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";

  export let examId: string;
  export let onStay: () => void;
</script>

{#if $gradingStore.showLastSubModal}
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/85 p-4 backdrop-blur-sm">
    <div class="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5)]">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 text-[1.75rem]">
        🏁
      </div>
      <h3 class="m-0 text-xl text-slate-50">Ende der Arbeiten</h3>
      <p class="m-0 text-sm text-slate-400">
        Du hast die letzte Arbeit dieser Prüfung erreicht. Alle vorliegenden Abgaben wurden korrigiert.
      </p>
      <div class="mt-2 flex w-full flex-col gap-2">
        <a
          href="/exam/{examId}"
          class="box-border w-full rounded-lg bg-indigo-600 px-4 py-[0.65rem] text-center text-sm font-semibold text-white no-underline transition-colors duration-150 ease-[ease] hover:bg-indigo-700"
        >
          Zurück zur Prüfungsübersicht
        </a>
        <button
          type="button"
          class="w-full cursor-pointer rounded-lg border border-slate-600 bg-slate-700 px-4 py-[0.55rem] text-[0.8rem] font-medium text-slate-300 transition-all duration-150 ease-[ease] hover:bg-slate-600 hover:text-white"
          on:click={onStay}
        >
          Auf dieser Seite bleiben
        </button>
      </div>
    </div>
  </div>
{/if}
