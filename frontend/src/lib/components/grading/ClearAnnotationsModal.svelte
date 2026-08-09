<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";

  // Destructive action confirm/cancel are callback props out to the parent,
  // which gates the actual clearing behind the user's explicit confirmation.
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

{#if $gradingStore.showClearConfirmModal}
  <div
    class="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
    on:click|self={onCancel}
    role="dialog"
  >
    <div
      class="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-[420px] w-full text-center flex flex-col items-center gap-4 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5)]"
    >
      <div
        class="w-14 h-14 rounded-full flex items-center justify-center text-2xl bg-red-500/20 text-red-500"
      >
        🗑
      </div>
      <h3 class="m-0 text-slate-50 text-xl">Alle Anmerkungen löschen?</h3>
      <p class="m-0 text-slate-400 text-sm">
        Möchtest du wirklich alle Zeichnungen und Stempel auf dieser Seite löschen? Dies setzt auch die automatisch berechneten Punkte zurück.
      </p>
      <div class="flex flex-col gap-2 w-full mt-2">
        <button
          type="button"
          class="w-full py-[0.65rem] px-4 bg-red-600 text-white border-none rounded-lg font-semibold text-sm cursor-pointer transition-colors duration-150 hover:bg-red-700"
          on:click={onConfirm}
        >
          Löschen bestätigen
        </button>
        <button
          type="button"
          class="w-full py-[0.55rem] px-4 bg-slate-700 text-slate-300 border border-slate-600 rounded-lg font-medium text-[0.8rem] cursor-pointer transition-all duration-150 hover:bg-slate-600 hover:text-white"
          on:click={onCancel}
        >
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}
