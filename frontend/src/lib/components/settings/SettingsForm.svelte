<script lang="ts">
  import "./SettingsForm.css";
  import type { StorageMode } from "$lib/stores/storagePolicy";
  import { t, LOCALES, LOCALE_LABELS, type Locale } from "$lib/i18n";
  import HelpButton from "$lib/components/help/HelpButton.svelte";
  import InfoTip from "$lib/components/help/InfoTip.svelte";

  export let storageMode: StorageMode;
  export let latexCompilation: "server" | "local";
  export let uiLocale: Locale;
  export let onStorageModeChange: (val: StorageMode) => void;
  export let onLatexChange: (val: "server" | "local") => void;
  export let onLocaleChange: (val: Locale) => void;
</script>

<div class="settings-form-card" id="storage-policy">
  <h3>
    {$t("settings.storage.heading")}
    <HelpButton topic="storageModes" size="sm" />
  </h3>
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
        <strong class="settings-form-option-title">{$t("settings.storage.allLocalTitle")}<InfoTip text={$t("help.tips.storageLocal")} topic="storageModes" /></strong>
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
        <strong class="settings-form-option-title">{$t("settings.storage.allServerTitle")}<InfoTip text={$t("help.tips.storageServer")} topic="storageModes" /></strong>
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
        <strong class="settings-form-option-title">{$t("settings.storage.hybridTitle")}<InfoTip text={$t("help.tips.storageHybrid")} topic="storageModes" /></strong>
        <p>{$t("settings.storage.hybridText")}</p>
      </div>
    </label>
  </div>

  <h3 style="margin-top: 1.5rem;">
    {$t("settings.latex.heading")}
    <HelpButton topic="settings" size="sm" />
  </h3>
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
        <strong class="settings-form-option-title">{$t("settings.latex.localTitle")}<InfoTip text={$t("help.tips.latexLocal")} topic="settings" /></strong>
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
        <strong class="settings-form-option-title">{$t("settings.latex.serverTitle")}<InfoTip text={$t("help.tips.latexServer")} topic="settings" /></strong>
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
