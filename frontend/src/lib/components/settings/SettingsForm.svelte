<script lang="ts">
  import "./SettingsForm.css";
  import type { StorageMode } from "$lib/stores/storagePolicy";

  export let storageMode: StorageMode;
  export let latexCompilation: "server" | "local";
  export let onStorageModeChange: (val: StorageMode) => void;
  export let onLatexChange: (val: "server" | "local") => void;
</script>

<div class="settings-form-card" id="storage-policy">
  <h3>1. Global Data Storage Strategy</h3>
  <p class="settings-form-description">Select where your exams, exercises, student identities, and results are stored:</p>
  <div class="settings-form-policy-options">
    <label class="settings-form-option-card" class:active={storageMode === "all-local"}>
      <input
        type="radio"
        name="storageMode"
        value="all-local"
        checked={storageMode === "all-local"}
        on:change={() => onStorageModeChange("all-local")}
      />
      <div>
        <strong>All Local (Privacy First)</strong>
        <p>Exams, exercise library, student identities, and scans stored 100% locally in your browser IndexedDB.</p>
      </div>
    </label>

    <label class="settings-form-option-card" class:active={storageMode === "all-server"}>
      <input
        type="radio"
        name="storageMode"
        value="all-server"
        checked={storageMode === "all-server"}
        on:change={() => onStorageModeChange("all-server")}
      />
      <div>
        <strong>All Server</strong>
        <p>All data synchronized and stored on the secure BlindGrade server.</p>
      </div>
    </label>

    <label class="settings-form-option-card" class:active={storageMode === "hybrid"}>
      <input
        type="radio"
        name="storageMode"
        value="hybrid"
        checked={storageMode === "hybrid"}
        on:change={() => onStorageModeChange("hybrid")}
      />
      <div>
        <strong>Hybrid Mode (Library on Server, Results Local)</strong>
        <p>Exercise library and exam templates on server, but student identities and grade submissions stay 100% on your local device.</p>
      </div>
    </label>
  </div>

  <h3 style="margin-top: 1.5rem;">2. LaTeX Compilation</h3>
  <p class="settings-form-description">Select where LaTeX files are compiled (independent of storage strategy):</p>
  <div class="settings-form-policy-options">
    <label class="settings-form-option-card" class:active={latexCompilation === "local"}>
      <input
        type="radio"
        name="latexCompilation"
        value="local"
        checked={latexCompilation === "local"}
        on:change={() => onLatexChange("local")}
      />
      <div>
        <strong>Local Client (WebAssembly)</strong>
        <p>Compiles inside your browser without sending source to any server.</p>
      </div>
    </label>
    <label class="settings-form-option-card" class:active={latexCompilation === "server"}>
      <input
        type="radio"
        name="latexCompilation"
        value="server"
        checked={latexCompilation === "server"}
        on:change={() => onLatexChange("server")}
      />
      <div>
        <strong>Server (Tectonic)</strong>
        <p>High performance server-side compilation. Requires authenticated account.</p>
      </div>
    </label>
  </div>
</div>
