<script lang="ts">
  import "./SettingsForm.css";
  import type { StorageMode } from "$lib/stores/storagePolicy";
  import { t, LOCALES, LOCALE_LABELS, type Locale } from "$lib/i18n";

  export let storageMode: StorageMode;
  export let latexCompilation: "server" | "local";
  export let uiLocale: Locale;
  export let onStorageModeChange: (val: StorageMode) => void;
  export let onLatexChange: (val: "server" | "local") => void;
  export let onLocaleChange: (val: Locale) => void;
</script>

<div class="settings-form-card" id="storage-policy">
  <h3>{$t("settings.storage.heading")}</h3>
  <p class="settings-form-description">{$t("settings.storage.description")}</p>
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
        <strong>{$t("settings.storage.allLocalTitle")}</strong>
        <p>{$t("settings.storage.allLocalText")}</p>
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
        <strong>{$t("settings.storage.allServerTitle")}</strong>
        <p>{$t("settings.storage.allServerText")}</p>
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
        <strong>{$t("settings.storage.hybridTitle")}</strong>
        <p>{$t("settings.storage.hybridText")}</p>
      </div>
    </label>
  </div>

  <h3 style="margin-top: 1.5rem;">{$t("settings.latex.heading")}</h3>
  <p class="settings-form-description">{$t("settings.latex.description")}</p>
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
        <strong>{$t("settings.latex.localTitle")}</strong>
        <p>{$t("settings.latex.localText")}</p>
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
        <strong>{$t("settings.latex.serverTitle")}</strong>
        <p>{$t("settings.latex.serverText")}</p>
      </div>
    </label>
  </div>

  <h3 style="margin-top: 1.5rem;">{$t("settings.language.heading")}</h3>
  <p class="settings-form-description">{$t("settings.language.description")}</p>
  <div class="settings-form-policy-options">
    {#each LOCALES as code (code)}
      <label class="settings-form-option-card" class:active={uiLocale === code}>
        <input
          type="radio"
          name="uiLocale"
          value={code}
          checked={uiLocale === code}
          on:change={() => onLocaleChange(code)}
        />
        <div>
          <strong>{LOCALE_LABELS[code]}</strong>
          <p>{$t("settings.language.hint")}</p>
        </div>
      </label>
    {/each}
  </div>
</div>
