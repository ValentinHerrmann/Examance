<script lang="ts">
  import { gradingStore, type ToolType } from "$lib/grading/gradingStore";

  // Destructive: clearing annotations is gated by a confirm-dialog step owned
  // by the parent/route, so this component only requests it — it never mutates
  // the store directly for this action.
  export let onClearRequested: () => void;

  function selectTool(tool: ToolType) {
    gradingStore.setDrawTool(tool);
  }
</script>

<div
  class="absolute top-3 left-3 z-30 flex flex-col gap-[0.2rem] p-[0.35rem] bg-slate-900/92 backdrop-blur-sm border border-slate-700/80 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)] max-h-[calc(100%-3rem)] overflow-y-auto"
>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "pen"}
    class:!text-white={$gradingStore.drawTool === "pen"}
    class:border-sky-400={$gradingStore.drawTool === "pen"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "pen"}
    on:click={() => selectTool("pen")}
    title="Freihand-Stift (Rot)"
  >
    <span class="text-base leading-none">🖊</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">Stift</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "line"}
    class:!text-white={$gradingStore.drawTool === "line"}
    class:border-sky-400={$gradingStore.drawTool === "line"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "line"}
    on:click={() => selectTool("line")}
    title="Gerade Linie zeichnen"
  >
    <span class="text-base leading-none">📏</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">Linie</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "eraser"}
    class:!text-white={$gradingStore.drawTool === "eraser"}
    class:border-sky-400={$gradingStore.drawTool === "eraser"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "eraser"}
    on:click={() => selectTool("eraser")}
    title="Radiergummi"
  >
    <span class="text-base leading-none">🧹</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">Radierer</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    class:!text-white={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    class:border-sky-400={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    on:click={() => selectTool("check_full")}
    title="Richtig (+1.0 Pkt.)"
  >
    <span class="text-base leading-none text-emerald-400">✓</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">+1.0</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "check_half"}
    class:!text-white={$gradingStore.drawTool === "check_half"}
    class:border-sky-400={$gradingStore.drawTool === "check_half"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "check_half"}
    on:click={() => selectTool("check_half")}
    title="Halb Richtig (1 Strich, +0.5 Pkt.)"
  >
    <span class="text-base leading-none text-amber-400">✓̷</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">+0.5</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "check_quarter"}
    class:!text-white={$gradingStore.drawTool === "check_quarter"}
    class:border-sky-400={$gradingStore.drawTool === "check_quarter"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "check_quarter"}
    on:click={() => selectTool("check_quarter")}
    title="Viertel Richtig (2 Striche, +0.25 Pkt.)"
  >
    <span class="text-base leading-none text-amber-300">✓̷̷</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">+0.25</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "minus_full"}
    class:!text-white={$gradingStore.drawTool === "minus_full"}
    class:border-sky-400={$gradingStore.drawTool === "minus_full"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "minus_full"}
    on:click={() => selectTool("minus_full")}
    title="Abzug (-1.0 Pkt.)"
  >
    <span class="text-base leading-none text-rose-400 font-bold">-1</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">-1.0</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "minus_half"}
    class:!text-white={$gradingStore.drawTool === "minus_half"}
    class:border-sky-400={$gradingStore.drawTool === "minus_half"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "minus_half"}
    on:click={() => selectTool("minus_half")}
    title="Halber Abzug (-0.5 Pkt.)"
  >
    <span class="text-base leading-none text-rose-400 font-bold">-½</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">-0.5</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "minus_quarter"}
    class:!text-white={$gradingStore.drawTool === "minus_quarter"}
    class:border-sky-400={$gradingStore.drawTool === "minus_quarter"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "minus_quarter"}
    on:click={() => selectTool("minus_quarter")}
    title="Viertel Abzug (-0.25 Pkt.)"
  >
    <span class="text-base leading-none text-rose-300 font-bold">-¼</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">-0.25</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    class:!text-white={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    class:border-sky-400={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    on:click={() => selectTool("wrong")}
    title="Falsch (0 Pkt.)"
  >
    <span class="text-base leading-none text-rose-500 font-serif italic font-bold">f</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">Falsch</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "missing"}
    class:!text-white={$gradingStore.drawTool === "missing"}
    class:border-sky-400={$gradingStore.drawTool === "missing"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "missing"}
    on:click={() => selectTool("missing")}
    title="Fehlt (0 Pkt.)"
  >
    <span class="text-base leading-none text-amber-500 font-bold">∀</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">Fehlt</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "wf"}
    class:!text-white={$gradingStore.drawTool === "wf"}
    class:border-sky-400={$gradingStore.drawTool === "wf"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "wf"}
    on:click={() => selectTool("wf")}
    title="Wiederholungsfehler"
  >
    <span class="text-base leading-none text-purple-400 font-bold">WF</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">WF</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "ff"}
    class:!text-white={$gradingStore.drawTool === "ff"}
    class:border-sky-400={$gradingStore.drawTool === "ff"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "ff"}
    on:click={() => selectTool("ff")}
    title="Folgefehler"
  >
    <span class="text-base leading-none text-indigo-400 font-bold">FF</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">FF</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-red-500/20 hover:text-red-400"
    on:click={onClearRequested}
    title="Alle Anmerkungen löschen"
  >
    <span class="text-base leading-none">🗑</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">Löschen</span>
  </button>
</div>
