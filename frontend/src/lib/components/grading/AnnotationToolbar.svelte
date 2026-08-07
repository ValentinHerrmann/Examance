<script lang="ts">
  import "./AnnotationToolbar.css";
  import { gradingStore, type ToolType } from "$lib/grading/gradingStore";

  // Destructive: clearing annotations is gated by a confirm-dialog step owned
  // by the parent/route, so this component only requests it — it never mutates
  // the store directly for this action.
  export let onClearRequested: () => void;

  function selectTool(tool: ToolType) {
    gradingStore.setDrawTool(tool);
  }
</script>

<div class="annotation-toolbar-floating-annotation-palette">
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "pen"}
    on:click={() => selectTool("pen")}
    title="Freihand-Stift (Rot)"
  >
    <span class="annotation-toolbar-tool-icon">🖊</span>
    <span class="annotation-toolbar-tool-label">Stift</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "line"}
    on:click={() => selectTool("line")}
    title="Gerade Linie zeichnen"
  >
    <span class="annotation-toolbar-tool-icon">📏</span>
    <span class="annotation-toolbar-tool-label">Linie</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "eraser"}
    on:click={() => selectTool("eraser")}
    title="Radiergummi"
  >
    <span class="annotation-toolbar-tool-icon">🧹</span>
    <span class="annotation-toolbar-tool-label">Radierer</span>
  </button>

  <div class="annotation-toolbar-palette-divider"></div>

  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    on:click={() => selectTool("check_full")}
    title="Richtig (+1.0 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-emerald-400">✓</span>
    <span class="annotation-toolbar-tool-label">+1.0</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "check_half"}
    on:click={() => selectTool("check_half")}
    title="Halb Richtig (1 Strich, +0.5 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-amber-400">✓̷</span>
    <span class="annotation-toolbar-tool-label">+0.5</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "check_quarter"}
    on:click={() => selectTool("check_quarter")}
    title="Viertel Richtig (2 Striche, +0.25 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-amber-300">✓̷̷</span>
    <span class="annotation-toolbar-tool-label">+0.25</span>
  </button>

  <div class="annotation-toolbar-palette-divider"></div>

  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "minus_full"}
    on:click={() => selectTool("minus_full")}
    title="Abzug (-1.0 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-rose-400 font-bold">-1</span>
    <span class="annotation-toolbar-tool-label">-1.0</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "minus_half"}
    on:click={() => selectTool("minus_half")}
    title="Halber Abzug (-0.5 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-rose-400 font-bold">-½</span>
    <span class="annotation-toolbar-tool-label">-0.5</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "minus_quarter"}
    on:click={() => selectTool("minus_quarter")}
    title="Viertel Abzug (-0.25 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-rose-300 font-bold">-¼</span>
    <span class="annotation-toolbar-tool-label">-0.25</span>
  </button>

  <div class="annotation-toolbar-palette-divider"></div>

  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    on:click={() => selectTool("wrong")}
    title="Falsch (0 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-rose-500 font-serif italic font-bold">f</span>
    <span class="annotation-toolbar-tool-label">Falsch</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "missing"}
    on:click={() => selectTool("missing")}
    title="Fehlt (0 Pkt.)"
  >
    <span class="annotation-toolbar-tool-icon text-amber-500 font-bold">∀</span>
    <span class="annotation-toolbar-tool-label">Fehlt</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "wf"}
    on:click={() => selectTool("wf")}
    title="Wiederholungsfehler"
  >
    <span class="annotation-toolbar-tool-icon text-purple-400 font-bold">WF</span>
    <span class="annotation-toolbar-tool-label">WF</span>
  </button>
  <button
    class:annotation-toolbar-active={$gradingStore.drawTool === "ff"}
    on:click={() => selectTool("ff")}
    title="Folgefehler"
  >
    <span class="annotation-toolbar-tool-icon text-indigo-400 font-bold">FF</span>
    <span class="annotation-toolbar-tool-label">FF</span>
  </button>

  <div class="annotation-toolbar-palette-divider"></div>

  <button
    class="annotation-toolbar-clear-btn"
    on:click={onClearRequested}
    title="Alle Anmerkungen löschen"
  >
    <span class="annotation-toolbar-tool-icon">🗑</span>
    <span class="annotation-toolbar-tool-label">Löschen</span>
  </button>
</div>
