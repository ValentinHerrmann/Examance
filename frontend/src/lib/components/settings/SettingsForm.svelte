<script lang="ts">
  import type { StorageMode } from "#lib/stores/storagePolicy";
  import { t, LOCALES, LOCALE_LABELS, type Locale } from "#lib/i18n";
  import { themePreference, setThemePreference, THEME_PREFERENCES } from "#lib/stores/theme";
  import { Icon, Card } from "#lib/components/ui";
  import { dataPlaceIcons, latexPlaceIcons } from "#lib/components/storage/placeIcons";
  import HelpButton from "#lib/components/help/HelpButton.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  interface Props {
    /** Null until the account has chosen one. */
    storageMode: StorageMode | null;
    latexCompilation: "server" | "local";
    uiLocale: Locale;
    onStorageModeChange: (val: StorageMode) => void;
    onLatexChange: (val: "server" | "local") => void;
    /** Modes this account may choose (`stores/capabilities.ts`); the others render disabled. */
    allowedModes: StorageMode[];
    /** Whether this account may compile on the server. */
    serverLatexEnabled: boolean;
    onLocaleChange: (val: Locale) => void;
    /** False for an admin account: it holds no exams, so storage mode and LaTeX engine are hidden (issue #58). */
    teaching?: boolean;
  }

  let {
    storageMode,
    latexCompilation,
    uiLocale,
    onStorageModeChange,
    onLatexChange,
    allowedModes,
    serverLatexEnabled,
    onLocaleChange,
    teaching = true,
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

  /**
   * The radios never select themselves: a mode change runs through the move dialog (and may be
   * cancelled). Cancelling the native toggle keeps the
   * checked dot on what is actually in effect; the store moves it once a change is committed.
   */
  function gated(event: MouseEvent, request: () => void) {
    event.preventDefault();
    request();
  }
</script>

{#if teaching}
<div id="storage-policy" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 flex items-center gap-2 text-xl font-medium text-content">
      {$t("settings.storage.heading")}
      <HelpButton topic="storageModes" size="sm" />
    </h2>
    <p class={description}>{$t("settings.storage.description")}</p>
    <div class={options}>
      <label class="{option} {allowedModes.includes("all-server") ? '' : 'cursor-not-allowed opacity-60'}">
        <input
          class={radio}
          type="radio"
          name="storageMode"
          value="all-server"
          checked={storageMode === "all-server"}
          disabled={!allowedModes.includes("all-server")}
          onclick={(e) => gated(e, () => onStorageModeChange("all-server"))}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={dataPlaceIcons["all-server"]} class="text-muted" />{$t("settings.storage.allServerTitle")}<InfoTip text={$t("help.tips.storageServer")} topic="storageModes" /></p>
          <p class={optionText}>{$t("settings.storage.allServerText")}</p>
        </div>
      </label>

      <label class="{option} {allowedModes.includes("hybrid") ? '' : 'cursor-not-allowed opacity-60'}">
        <input
          class={radio}
          type="radio"
          name="storageMode"
          value="hybrid"
          checked={storageMode === "hybrid"}
          disabled={!allowedModes.includes("hybrid")}
          onclick={(e) => gated(e, () => onStorageModeChange("hybrid"))}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={dataPlaceIcons.hybrid} class="text-muted" />{$t("settings.storage.hybridTitle")}<InfoTip text={$t("help.tips.storageHybrid")} topic="storageModes" /></p>
          <p class={optionText}>{$t("settings.storage.hybridText")}</p>
        </div>
      </label>
    </div>
    {#if allowedModes.length < 2}
      <p class="m-0 mt-3 text-xs text-muted">{$t("storagePolicy.notEnabled")}</p>
    {/if}
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
          onclick={(e) => gated(e, () => onLatexChange("local"))}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={latexPlaceIcons.local} class="text-muted" />{$t("settings.latex.localTitle")}<InfoTip text={$t("help.tips.latexLocal")} topic="settings" /></p>
          <p class={optionText}>{$t("settings.latex.localText")}</p>
        </div>
      </label>
      <label class="{option} {serverLatexEnabled ? '' : 'cursor-not-allowed opacity-60'}">
        <input
          class={radio}
          type="radio"
          name="latexCompilation"
          value="server"
          checked={latexCompilation === "server"}
          disabled={!serverLatexEnabled}
          onclick={(e) => gated(e, () => onLatexChange("server"))}
        />
        <div class="min-w-0">
          <p class={optionTitle}><Icon icon={latexPlaceIcons.server} class="text-muted" />{$t("settings.latex.serverTitle")}<InfoTip text={$t("help.tips.latexServer")} topic="settings" /></p>
          <p class={optionText}>{$t("settings.latex.serverText")}</p>
        </div>
      </label>
    </div>
    {#if !serverLatexEnabled}
      <p class="m-0 mt-3 text-xs text-muted">{$t("storagePolicy.notEnabled")}</p>
    {/if}
  </Card>
</div>
{/if}

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
