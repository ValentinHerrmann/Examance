<script lang="ts">
  import type { StorageMode } from "#lib/stores/storagePolicy";
  import { t, LOCALES, LOCALE_LABELS, type Locale } from "#lib/i18n";
  import { themePreference, setThemePreference, THEME_PREFERENCES } from "#lib/stores/theme";
  import { Alert, Badge, Card, OptionTile } from "#lib/components/ui";
  import { apiErrorMessage } from "#lib/api/client";
  import { capabilitiesStore, savePreviewDrawnPages } from "#lib/stores/capabilities";
  import { dataPlaceIcons, latexPlaceIcons } from "#lib/components/storage/placeIcons";
  import HelpButton from "#lib/components/help/HelpButton.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  interface Props {
    /** Null until the account has chosen one. */
    storageMode: StorageMode | null;
    latexCompilation?: "server" | "local";
    uiLocale?: Locale;
    onStorageModeChange?: (val: StorageMode) => void;
    onLatexChange?: (val: "server" | "local") => void;
    /** Modes this account may choose (`stores/capabilities.ts`); the others render disabled. */
    allowedModes: StorageMode[];
    /** Whether this account may compile on the server. */
    serverLatexEnabled?: boolean;
    onLocaleChange?: (val: Locale) => void;
    /** Which cards to render, so the page can order them by how often they are used. */
    part: "storage" | "latex" | "general";
  }

  let {
    storageMode,
    latexCompilation = "local",
    uiLocale = "de",
    onStorageModeChange = () => {},
    onLatexChange = () => {},
    allowedModes,
    serverLatexEnabled = false,
    onLocaleChange = () => {},
    part,
  }: Props = $props();

  const themeLabels = {
    system: "nav.themeSystem",
    light: "nav.themeLight",
    dark: "nav.themeDark",
  } as const;

  /** The exercise editor's preview mode is only offered while the browser engine compiles. */
  let drawnPages = $derived($capabilitiesStore?.previewDrawnPages !== false);
  let previewBusy = $state(false);
  let previewError = $state("");

  async function setPreviewDrawn(next: boolean) {
    previewBusy = true;
    previewError = "";
    try {
      await savePreviewDrawnPages(next);
    } catch (err) {
      previewError = apiErrorMessage(err, $t("settings.latex.previewFailed"));
    } finally {
      previewBusy = false;
    }
  }

  const sectionId = "scroll-mt-16 lg:scroll-mt-4";
  const options = "flex flex-col gap-3";
  const description = "mt-0 mb-4 text-sm text-muted";

  /** Storage tiles only: a mode change runs through the move dialog (and may be cancelled), so the native toggle is cancelled and the store moves the dot once committed. Never for a setting that changes inside the click: the browser restores the old radio after a cancelled click, over Svelte's update. */
  function gated(event: MouseEvent, request: () => void) {
    event.preventDefault();
    request();
  }
</script>

{#if part === "storage"}
<div id="storage-policy" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 flex items-center gap-2 text-xl font-medium text-content">
      {$t("settings.storage.heading")}
      <HelpButton topic="storageModes" size="sm" />
    </h2>
    <p class={description}>{$t("settings.storage.description")}</p>
    <div class={options}>
      <OptionTile
        name="storageMode"
        value="all-server"
        checked={storageMode === "all-server"}
        disabled={!allowedModes.includes("all-server")}
        icon={dataPlaceIcons["all-server"]}
        title={$t("settings.storage.allServerTitle")}
        text={$t("settings.storage.allServerText")}
        onclick={(e) => gated(e, () => onStorageModeChange("all-server"))}
      >
        {#snippet titleExtra()}<InfoTip text={$t("help.tips.storageServer")} topic="storageModes" />{/snippet}
      </OptionTile>
      <OptionTile
        name="storageMode"
        value="hybrid"
        checked={storageMode === "hybrid"}
        disabled={!allowedModes.includes("hybrid")}
        icon={dataPlaceIcons.hybrid}
        title={$t("settings.storage.hybridTitle")}
        text={$t("settings.storage.hybridText")}
        onclick={(e) => gated(e, () => onStorageModeChange("hybrid"))}
      >
        {#snippet titleExtra()}<InfoTip text={$t("help.tips.storageHybrid")} topic="storageModes" />{/snippet}
      </OptionTile>
    </div>
    {#if allowedModes.length < 2}
      <p class="m-0 mt-3 text-xs text-muted">{$t("storagePolicy.notEnabled")}</p>
    {/if}
  </Card>
</div>

{:else if part === "latex"}
<div id="latex" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 flex items-center gap-2 text-xl font-medium text-content">
      {$t("settings.latex.heading")}
      <HelpButton topic="settings" size="sm" />
    </h2>
    <p class={description}>{$t("settings.latex.description")}</p>
    <div class={options}>
      <OptionTile
        name="latexCompilation"
        value="local"
        checked={latexCompilation === "local"}
        icon={latexPlaceIcons.local}
        title={$t("settings.latex.localTitle")}
        text={$t("settings.latex.localText")}
        onclick={() => onLatexChange("local")}
      >
        {#snippet titleExtra()}<Badge severity="success" size="xs">{$t("settings.latex.recommended")}</Badge><InfoTip text={$t("help.tips.latexLocal")} topic="settings" />{/snippet}
      </OptionTile>
      <OptionTile
        name="latexCompilation"
        value="server"
        checked={latexCompilation === "server"}
        disabled={!serverLatexEnabled}
        icon={latexPlaceIcons.server}
        title={$t("settings.latex.serverTitle")}
        text={$t("settings.latex.serverText")}
        onclick={() => onLatexChange("server")}
      >
        {#snippet titleExtra()}<InfoTip text={$t("help.tips.latexServer")} topic="settings" />{/snippet}
      </OptionTile>
    </div>
    {#if !serverLatexEnabled}
      <p class="m-0 mt-3 text-xs text-muted">{$t("storagePolicy.notEnabled")}</p>
    {/if}
    {#if $capabilitiesStore}
      <div class="mt-4 border-t border-line pt-4">
        <h3 class="m-0 mb-1 text-base font-medium text-content">{$t("settings.latex.previewHeading")}</h3>
        <p class={description}>{$t("settings.latex.previewHint")}</p>
        <div class={options}>
          <OptionTile
            name="previewMode"
            value="drawn"
            checked={drawnPages}
            disabled={previewBusy || latexCompilation === "server"}
            title={$t("settings.latex.previewDrawn")}
            onclick={() => setPreviewDrawn(true)}
          />
          <OptionTile
            name="previewMode"
            value="exact"
            checked={!drawnPages}
            disabled={previewBusy || latexCompilation === "server"}
            title={$t("settings.latex.previewExact")}
            onclick={() => setPreviewDrawn(false)}
          />
        </div>
        {#if latexCompilation === "server"}
          <p class="m-0 mt-3 text-xs text-muted">{$t("settings.latex.previewServerOnly")}</p>
        {/if}
        {#if previewError}
          <Alert severity="danger" class="mt-3">{previewError}</Alert>
        {/if}
      </div>
    {/if}
  </Card>
</div>
{:else}
<div id="language" class={sectionId}>
  <Card>
    <h2 class="m-0 mb-1 text-xl font-medium text-content">{$t("settings.language.heading")}</h2>
    <p class={description}>{$t("settings.language.description")}</p>
    <div class={options}>
      {#each LOCALES as code (code)}
        <OptionTile name="uiLocale" value={code} checked={uiLocale === code} title={LOCALE_LABELS[code]} text={$t("settings.language.hint")} onchange={() => onLocaleChange(code)} />
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
        <OptionTile
          name="uiTheme"
          value={pref}
          checked={$themePreference === pref}
          title={$t(themeLabels[pref])}
          text={pref === "system" ? $t("settings.theme.hint") : undefined}
          onchange={() => setThemePreference(pref)}
        />
      {/each}
    </div>
  </Card>
</div>

{/if}
