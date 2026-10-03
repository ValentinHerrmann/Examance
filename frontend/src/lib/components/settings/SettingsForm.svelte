<script lang="ts">
  import type { StorageMode } from "#lib/stores/storagePolicy";
  import { t, LOCALES, LOCALE_LABELS, type Locale } from "#lib/i18n";
  import { themePreference, setThemePreference, THEME_PREFERENCES } from "#lib/stores/theme";
  import { Icon, Card } from "#lib/components/ui";
  import { dataPlaceIcons, latexPlaceIcons } from "#lib/components/storage/placeIcons";
  import HelpButton from "#lib/components/help/HelpButton.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  interface Props {
    storageMode: StorageMode;
    latexCompilation: "server" | "local";
    uiLocale: Locale;
    onStorageModeChange: (val: StorageMode) => void;
    onLatexChange: (val: "server" | "local") => void;
    onLocaleChange: (val: Locale) => void;
  }

  let {
    storageMode,
    latexCompilation,
    uiLocale,
    onStorageModeChange,
    onLatexChange,
    onLocaleChange
  }: Props = $props();

  const themeLabels = {
    system: "nav.themeSystem",
    light: "nav.themeLight",
    dark: "nav.themeDark",
  } as const;

  const sectionId = "scroll-mt-16 lg:scroll-mt-4";
  const options = "flex flex-col gap-3";
  const option =
    "flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-line-strong bg-surface-sunken p-4 hover:border-line-hover has-[:checked]:border-primary has-[:checked]:bg-highlight";
  const radio = "mt-0.5 size-5 shrink-0 cursor-pointer accent-primary";
  const optionTitle = "m-0 flex items-center gap-1.5 text-base font-medium text-content";
  const optionText = "m-0 mt-1 text-sm text-muted";
  const description = "mt-0 mb-4 text-sm text-muted";
</script>

<div id="storage-policy" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 flex items-center gap-2 text-xl font-medium text-content">
      {$t("settings.storage.heading")}
      <HelpButton topic="storageModes" size="sm" />
    </h2>
    <p class={description}>{$t("settings.storage.description")}</p>
    <div class={options}>
      <label class={option}>
        <input
          class={radio}
          type="radio"
          name="storageMode"
          value="all-local"
          checked={storageMode === "all-local"}
          onchange={() => onStorageModeChange("all-local")}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={dataPlaceIcons["all-local"]} class="text-muted" />{$t("settings.storage.allLocalTitle")}<InfoTip text={$t("help.tips.storageLocal")} topic="storageModes" /></p>
          <p class={optionText}>{$t("settings.storage.allLocalText")}</p>
        </div>
      </label>

      <label class={option}>
        <input
          class={radio}
          type="radio"
          name="storageMode"
          value="all-server"
          checked={storageMode === "all-server"}
          onchange={() => onStorageModeChange("all-server")}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={dataPlaceIcons["all-server"]} class="text-muted" />{$t("settings.storage.allServerTitle")}<InfoTip text={$t("help.tips.storageServer")} topic="storageModes" /></p>
          <p class={optionText}>{$t("settings.storage.allServerText")}</p>
        </div>
      </label>

      <label class={option}>
        <input
          class={radio}
          type="radio"
          name="storageMode"
          value="hybrid"
          checked={storageMode === "hybrid"}
          onchange={() => onStorageModeChange("hybrid")}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={dataPlaceIcons.hybrid} class="text-muted" />{$t("settings.storage.hybridTitle")}<InfoTip text={$t("help.tips.storageHybrid")} topic="storageModes" /></p>
          <p class={optionText}>{$t("settings.storage.hybridText")}</p>
        </div>
      </label>
    </div>
  </Card>
</div>

<div id="latex" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 flex items-center gap-2 text-xl font-medium text-content">
      {$t("settings.latex.heading")}
      <HelpButton topic="settings" size="sm" />
    </h2>
    <p class={description}>{$t("settings.latex.description")}</p>
    <div class={options}>
      <label class={option}>
        <input
          class={radio}
          type="radio"
          name="latexCompilation"
          value="local"
          checked={latexCompilation === "local"}
          onchange={() => onLatexChange("local")}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={latexPlaceIcons.local} class="text-muted" />{$t("settings.latex.localTitle")}<InfoTip text={$t("help.tips.latexLocal")} topic="settings" /></p>
          <p class={optionText}>{$t("settings.latex.localText")}</p>
        </div>
      </label>
      <label class={option}>
        <input
          class={radio}
          type="radio"
          name="latexCompilation"
          value="server"
          checked={latexCompilation === "server"}
          onchange={() => onLatexChange("server")}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={latexPlaceIcons.server} class="text-muted" />{$t("settings.latex.serverTitle")}<InfoTip text={$t("help.tips.latexServer")} topic="settings" /></p>
          <p class={optionText}>{$t("settings.latex.serverText")}</p>
        </div>
      </label>
    </div>
  </Card>
</div>

<div id="language" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 text-xl font-medium text-content">{$t("settings.language.heading")}</h2>
    <p class={description}>{$t("settings.language.description")}</p>
    <div class={options}>
      {#each LOCALES as code (code)}
        <label class={option}>
          <input
            class={radio}
            type="radio"
            name="uiLocale"
            value={code}
            checked={uiLocale === code}
            onchange={() => onLocaleChange(code)}
          />
          <div class="min-w-0">
            <p class={optionTitle}>{LOCALE_LABELS[code]}</p>
            <p class={optionText}>{$t("settings.language.hint")}</p>
          </div>
        </label>
      {/each}
    </div>
  </Card>
</div>

<div id="theme" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 text-xl font-medium text-content">{$t("settings.theme.heading")}</h2>
    <p class={description}>{$t("settings.theme.description")}</p>
    <div class={options}>
      {#each THEME_PREFERENCES as pref (pref)}
        <label class={option}>
          <input
            class={radio}
            type="radio"
            name="uiTheme"
            value={pref}
            checked={$themePreference === pref}
            onchange={() => setThemePreference(pref)}
          />
          <div class="min-w-0">
            <p class={optionTitle}>{$t(themeLabels[pref])}</p>
            {#if pref === "system"}<p class={optionText}>{$t("settings.theme.hint")}</p>{/if}
          </div>
        </label>
      {/each}
    </div>
  </Card>
</div>
