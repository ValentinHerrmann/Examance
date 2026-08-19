<script lang="ts">
  import { gradingStore, type ToolType } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";

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
    title={$t("grading.toolbar.penTitle")}
  >
    <span class="text-base leading-none">🖊</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.pen")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "line"}
    class:!text-white={$gradingStore.drawTool === "line"}
    class:border-sky-400={$gradingStore.drawTool === "line"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "line"}
    on:click={() => selectTool("line")}
    title={$t("grading.toolbar.lineTitle")}
  >
    <span class="text-base leading-none">📏</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.line")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "eraser"}
    class:!text-white={$gradingStore.drawTool === "eraser"}
    class:border-sky-400={$gradingStore.drawTool === "eraser"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "eraser"}
    on:click={() => selectTool("eraser")}
    title={$t("grading.toolbar.eraserTitle")}
  >
    <span class="text-base leading-none">🧹</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.eraser")}</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    class:!text-white={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    class:border-sky-400={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    on:click={() => selectTool("check_full")}
    title={$t("grading.toolbar.checkFullTitle")}
  >
    <span class="text-base leading-none text-emerald-400">✓</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.checkFull")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "check_half"}
    class:!text-white={$gradingStore.drawTool === "check_half"}
    class:border-sky-400={$gradingStore.drawTool === "check_half"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "check_half"}
    on:click={() => selectTool("check_half")}
    title={$t("grading.toolbar.checkHalfTitle")}
  >
    <span class="text-base leading-none text-amber-400">✓̷</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.checkHalf")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "check_quarter"}
    class:!text-white={$gradingStore.drawTool === "check_quarter"}
    class:border-sky-400={$gradingStore.drawTool === "check_quarter"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "check_quarter"}
    on:click={() => selectTool("check_quarter")}
    title={$t("grading.toolbar.checkQuarterTitle")}
  >
    <span class="text-base leading-none text-amber-300">✓̷̷</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.checkQuarter")}</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "minus_full"}
    class:!text-white={$gradingStore.drawTool === "minus_full"}
    class:border-sky-400={$gradingStore.drawTool === "minus_full"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "minus_full"}
    on:click={() => selectTool("minus_full")}
    title={$t("grading.toolbar.minusFullTitle")}
  >
    <span class="text-base leading-none text-rose-400 font-bold">-1</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.minusFull")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "minus_half"}
    class:!text-white={$gradingStore.drawTool === "minus_half"}
    class:border-sky-400={$gradingStore.drawTool === "minus_half"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "minus_half"}
    on:click={() => selectTool("minus_half")}
    title={$t("grading.toolbar.minusHalfTitle")}
  >
    <span class="text-base leading-none text-rose-400 font-bold">-½</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.minusHalf")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "minus_quarter"}
    class:!text-white={$gradingStore.drawTool === "minus_quarter"}
    class:border-sky-400={$gradingStore.drawTool === "minus_quarter"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "minus_quarter"}
    on:click={() => selectTool("minus_quarter")}
    title={$t("grading.toolbar.minusQuarterTitle")}
  >
    <span class="text-base leading-none text-rose-300 font-bold">-¼</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.minusQuarter")}</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    class:!text-white={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    class:border-sky-400={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    on:click={() => selectTool("wrong")}
    title={$t("grading.toolbar.wrongTitle")}
  >
    <span class="text-base leading-none text-rose-500 font-serif italic font-bold">f</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.wrong")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "missing"}
    class:!text-white={$gradingStore.drawTool === "missing"}
    class:border-sky-400={$gradingStore.drawTool === "missing"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "missing"}
    on:click={() => selectTool("missing")}
    title={$t("grading.toolbar.missingTitle")}
  >
    <span class="text-base leading-none text-amber-500 font-bold">∀</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.missing")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "wf"}
    class:!text-white={$gradingStore.drawTool === "wf"}
    class:border-sky-400={$gradingStore.drawTool === "wf"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "wf"}
    on:click={() => selectTool("wf")}
    title={$t("grading.toolbar.wfTitle")}
  >
    <span class="text-base leading-none text-purple-400 font-bold">WF</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.wf")}</span>
  </button>
  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-slate-800 hover:text-slate-50"
    class:bg-sky-600={$gradingStore.drawTool === "ff"}
    class:!text-white={$gradingStore.drawTool === "ff"}
    class:border-sky-400={$gradingStore.drawTool === "ff"}
    class:shadow-[0_0_10px_rgba(56,189,248,0.3)]={$gradingStore.drawTool === "ff"}
    on:click={() => selectTool("ff")}
    title={$t("grading.toolbar.ffTitle")}
  >
    <span class="text-base leading-none text-indigo-400 font-bold">FF</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.ff")}</span>
  </button>

  <div class="h-px bg-slate-700 mx-[0.2rem] my-[0.15rem]"></div>

  <button
    class="flex flex-col items-center justify-center w-11 h-10 p-[0.15rem] bg-transparent border border-transparent rounded-lg text-slate-400 cursor-pointer transition-all duration-150 hover:bg-red-500/20 hover:text-red-400"
    on:click={onClearRequested}
    title={$t("grading.toolbar.clearTitle")}
  >
    <span class="text-base leading-none">🗑</span>
    <span class="text-[0.625rem] font-semibold mt-[0.1rem]">{$t("grading.toolbar.clear")}</span>
  </button>
</div>
