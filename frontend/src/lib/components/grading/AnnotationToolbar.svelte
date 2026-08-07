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

<div class="floating-annotation-palette">
  <button
    class:active={$gradingStore.drawTool === "pen"}
    on:click={() => selectTool("pen")}
    title="Freihand-Stift (Rot)"
  >
    <span class="tool-icon">🖊</span>
    <span class="tool-label">Stift</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "line"}
    on:click={() => selectTool("line")}
    title="Gerade Linie zeichnen"
  >
    <span class="tool-icon">📏</span>
    <span class="tool-label">Linie</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "eraser"}
    on:click={() => selectTool("eraser")}
    title="Radiergummi"
  >
    <span class="tool-icon">🧹</span>
    <span class="tool-label">Radierer</span>
  </button>

  <div class="palette-divider"></div>

  <button
    class:active={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    on:click={() => selectTool("check_full")}
    title="Richtig (+1.0 Pkt.)"
  >
    <span class="tool-icon text-emerald-400">✓</span>
    <span class="tool-label">+1.0</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "check_half"}
    on:click={() => selectTool("check_half")}
    title="Halb Richtig (1 Strich, +0.5 Pkt.)"
  >
    <span class="tool-icon text-amber-400">✓̷</span>
    <span class="tool-label">+0.5</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "check_quarter"}
    on:click={() => selectTool("check_quarter")}
    title="Viertel Richtig (2 Striche, +0.25 Pkt.)"
  >
    <span class="tool-icon text-amber-300">✓̷̷</span>
    <span class="tool-label">+0.25</span>
  </button>

  <div class="palette-divider"></div>

  <button
    class:active={$gradingStore.drawTool === "minus_full"}
    on:click={() => selectTool("minus_full")}
    title="Abzug (-1.0 Pkt.)"
  >
    <span class="tool-icon text-rose-400 font-bold">-1</span>
    <span class="tool-label">-1.0</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "minus_half"}
    on:click={() => selectTool("minus_half")}
    title="Halber Abzug (-0.5 Pkt.)"
  >
    <span class="tool-icon text-rose-400 font-bold">-½</span>
    <span class="tool-label">-0.5</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "minus_quarter"}
    on:click={() => selectTool("minus_quarter")}
    title="Viertel Abzug (-0.25 Pkt.)"
  >
    <span class="tool-icon text-rose-300 font-bold">-¼</span>
    <span class="tool-label">-0.25</span>
  </button>

  <div class="palette-divider"></div>

  <button
    class:active={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    on:click={() => selectTool("wrong")}
    title="Falsch (0 Pkt.)"
  >
    <span class="tool-icon text-rose-500 font-serif italic font-bold">f</span>
    <span class="tool-label">Falsch</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "missing"}
    on:click={() => selectTool("missing")}
    title="Fehlt (0 Pkt.)"
  >
    <span class="tool-icon text-amber-500 font-bold">∀</span>
    <span class="tool-label">Fehlt</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "wf"}
    on:click={() => selectTool("wf")}
    title="Wiederholungsfehler"
  >
    <span class="tool-icon text-purple-400 font-bold">WF</span>
    <span class="tool-label">WF</span>
  </button>
  <button
    class:active={$gradingStore.drawTool === "ff"}
    on:click={() => selectTool("ff")}
    title="Folgefehler"
  >
    <span class="tool-icon text-indigo-400 font-bold">FF</span>
    <span class="tool-label">FF</span>
  </button>

  <div class="palette-divider"></div>

  <button
    class="clear-btn"
    on:click={onClearRequested}
    title="Alle Anmerkungen löschen"
  >
    <span class="tool-icon">🗑</span>
    <span class="tool-label">Löschen</span>
  </button>
</div>

<style>
  .floating-annotation-palette {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.35rem;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(51, 65, 85, 0.8);
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    max-height: calc(100% - 3rem);
    overflow-y: auto;
  }

  .floating-annotation-palette button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 40px;
    padding: 0.15rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .floating-annotation-palette button:hover {
    background: #1e293b;
    color: #f8fafc;
  }

  .floating-annotation-palette button.active {
    background: #0284c7;
    color: #ffffff;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
  }

  .tool-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .tool-label {
    font-size: 0.625rem;
    font-weight: 600;
    margin-top: 0.1rem;
  }

  .palette-divider {
    height: 1px;
    background: #334155;
    margin: 0.15rem 0.2rem;
  }

  .clear-btn:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    color: #f87171 !important;
  }
</style>
