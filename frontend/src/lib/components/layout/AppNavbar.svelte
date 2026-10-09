<script lang="ts">
  import { page } from "$app/state";
  import {
    faArrowRightFromBracket,
    faBars,
    faCircleHalfStroke,
    faCircleQuestion,
    faCircleUser,
    faDatabase,
    faFileExport,
    faFileImport,
    faFolderOpen,
    faGear,
    faLock,
    faMoon,
    faSun,
    faTrashCan,
    faTriangleExclamation,
  } from "@fortawesome/free-solid-svg-icons";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { locale, t, toggleLocale, LOCALE_LABELS, type Locale } from "#lib/i18n";
  import { dataPlaceIcons, latexPlaceIcons } from "#lib/components/storage/placeIcons";
  import type { TranslationKey } from "#lib/i18n/types";
  import { getStoragePolicyBadge, type StorageMode } from "#lib/stores/storagePolicy";
  import type { VersionStatus } from "#lib/stores/versionStore";
  import { themePreference, setThemePreference, theme, type ThemePreference } from "#lib/stores/theme";
  import { mobileNavOpen } from "#lib/stores/shell";
  import { minWidth } from "#lib/stores/viewport";
  import { ADMIN_HOME } from "#lib/stores/navigationStore";
  import { Icon, Menu, MenuItem } from "#lib/components/ui";

  /**
   * Artemis navbar, dark slate in both themes: brand and (from `xl`) main links left; storage mode, workspace, language,
   * theme, help, account right. Below `xl` the links move into the drawer (they do not fit at 1024px). `minimal` is for
   * locked and public pages: brand, language, theme, help. Admins get user management only (issue #58).
   */
  interface Props {
    variant?: "full" | "minimal";
    authenticated?: boolean;
    userRole?: string | null;
    userEmail?: string | null;
    /** `null` = the account has not chosen a mode yet. */
    storageMode?: StorageMode | null;
    latexCompilation?: "local" | "server";
    versionStatus?: VersionStatus;
    helpUnseen?: boolean;
    onStorageClick?: () => void;
    onHelpClick?: () => void;
    onOpenArchive?: () => void;
    onExportArchive?: () => void;
    /** Export exams with scans and results but without the exercises' code, to share with another teacher. */
    onShareResults?: () => void;
    onClearWorkspace?: () => void;
    onLock?: () => void;
  }

  let {
    variant = "full",
    authenticated = false,
    userRole = null,
    userEmail = null,
    storageMode = null,
    latexCompilation = "local",
    versionStatus = "no-server",
    helpUnseen = false,
    onStorageClick = () => {},
    onHelpClick = () => {},
    onOpenArchive = () => {},
    onExportArchive = () => {},
    onShareResults = () => {},
    onClearWorkspace = () => {},
    onLock = () => {},
  }: Props = $props();

  let isAdmin = $derived(userRole === "admin");
  let links = $derived(
    isAdmin
      ? [{ href: ADMIN_HOME, label: $t("nav.userManagement") }]
      : [
          { href: "/", label: $t("nav.dashboard") },
          { href: "/exercises", label: $t("nav.exerciseLibrary") },
          { href: "/analytics", label: $t("nav.analytics") },
        ],
  );

  let currentPath = $derived(page.url.pathname);
  function isActive(href: string) {
    return href === "/" ? currentPath === "/" : currentPath.startsWith(href);
  }

  const dataKeys: Record<StorageMode, { label: TranslationKey; title: TranslationKey }> = {
    "all-server": { label: "nav.dataCloud", title: "storagePolicy.allServerTitle" },
    hybrid: { label: "nav.dataHybrid", title: "storagePolicy.hybridTitle" },
  };

  const latexKeys: Record<"local" | "server", { label: TranslationKey; title: TranslationKey }> = {
    local: { label: "nav.latexLocalShort", title: "nav.latexLocalTitle" },
    server: { label: "nav.latexServerShort", title: "nav.latexServerTitle" },
  };

  let notChosenBadge = $derived(getStoragePolicyBadge({ storageMode: null, latexCompilation }));
  let dataLabel = $derived(storageMode ? $t(dataKeys[storageMode].label) : notChosenBadge.text);
  let dataTitle = $derived(storageMode ? $t(dataKeys[storageMode].title) : notChosenBadge.title);
  let latexLabel = $derived($t(latexKeys[latexCompilation].label));
  let latexTitle = $derived($t(latexKeys[latexCompilation].title));

  const themeIcons: Record<ThemePreference, IconDefinition> = {
    system: faCircleHalfStroke,
    light: faSun,
    dark: faMoon,
  };

  const themeOptions: ThemePreference[] = ["system", "light", "dark"];

  // Behaviour, not looks: the workspace actions sit in the account menu on phones, in their own menu from `sm`.
  const smUp = minWidth("sm", true);

  let nextLocale = $derived(($locale === "de" ? "en" : "de") as Locale);

  // One look for every control on the slate bar. `shrink-0`: a squeezed control would clip silently (issue #67).
  const control =
    "inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-sm font-medium " +
    "text-navbar-muted no-underline hover:bg-navbar-hover hover:text-navbar-content " +
    "aria-expanded:bg-navbar-hover aria-expanded:text-navbar-content pointer-coarse:min-h-11";
  const iconControl = control + " w-10 justify-center px-0 pointer-coarse:w-11";
</script>

{#snippet workspaceItems()}
  <MenuItem icon={faFileImport} onSelect={onOpenArchive}>{$t("workspace.menu.open")}</MenuItem>
  <MenuItem icon={faFileExport} onSelect={onExportArchive}>{$t("workspace.menu.export")}</MenuItem>
  <MenuItem icon={faFileExport} onSelect={onShareResults}>{$t("workspace.menu.shareResults")}</MenuItem>
  <MenuItem icon={faTrashCan} danger onSelect={onClearWorkspace}>{$t("workspace.menu.clear")}</MenuItem>
{/snippet}

<header
  class="flex min-h-12 shrink-0 items-center gap-1 bg-navbar px-2 pt-[env(safe-area-inset-top)] text-navbar-content sm:gap-2 sm:px-4"
>
  {#if variant === "full"}
    <button
      type="button"
      class="{iconControl} xl:hidden"
      aria-label={$t("nav.openMenu")}
      aria-expanded={$mobileNavOpen}
      onclick={() => mobileNavOpen.set(!$mobileNavOpen)}
    >
      <Icon icon={faBars} class="text-lg" />
    </button>
  {/if}

  <a
    href={isAdmin ? ADMIN_HOME : "/"}
    class="mr-2 inline-flex min-h-10 shrink-0 items-center gap-2.5 pointer-coarse:min-h-11 rounded-md px-1 text-lg font-semibold text-navbar-content no-underline"
  >
    <img src="/favicon.png" alt={$t("nav.logoAlt")} class="size-7 rounded-sm object-contain" />
    <span class="hidden sm:inline">Examance</span>
  </a>

  {#if variant === "full"}
    <nav class="hidden h-12 items-stretch xl:flex" aria-label={$t("nav.menuLabel")}>
      {#each links as link (link.href)}
        <a
          href={link.href}
          aria-current={isActive(link.href) ? "page" : undefined}
          class="relative flex items-center px-3 text-sm font-medium no-underline hover:text-navbar-content {isActive(
            link.href,
          )
            ? 'text-navbar-content after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-navbar-content'
            : 'text-navbar-muted'}"
        >
          {link.label}
        </a>
      {/each}
    </nav>
  {/if}

  <div class="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
    {#if variant === "full"}
      {#if versionStatus === "mismatch" || versionStatus === "incompatible"}
        <span
          class="hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold sm:inline-flex {versionStatus ===
          'incompatible'
            ? 'bg-danger text-danger-contrast'
            : 'bg-warning text-warning-contrast'}"
          title={versionStatus === "incompatible"
            ? $t("statusBar.incompatibleTitle")
            : $t("statusBar.mismatchShort")}
        >
          <Icon icon={faTriangleExclamation} />
          <span class="hidden 2xl:inline">
            {versionStatus === "incompatible"
              ? $t("statusBar.incompatibleTitle")
              : $t("statusBar.mismatchShort")}
          </span>
        </span>
      {/if}

      {#if !isAdmin}
      <!-- Data + LaTeX from sm (mark + state icon); on phones they do not fit and live in the drawer, the version in the footer. -->
      <div class="hidden items-center sm:flex sm:gap-1">
        <button
          type="button"
          class="{control} gap-1 px-1.5 sm:gap-2 sm:px-2.5"
          title="{$t('nav.dataLabel')}: {dataLabel} – {dataTitle}"
          aria-label={$t("nav.storageMode", { mode: dataLabel })}
          onclick={onStorageClick}
        >
          <Icon icon={faDatabase} class="text-xs opacity-70" />
          {#if storageMode}
            <Icon icon={dataPlaceIcons[storageMode]} />
          {/if}
          <span class="hidden truncate xl:inline">{$t("nav.dataLabel")}: {dataLabel}</span>
        </button>
        <button
          type="button"
          class="{control} gap-1 px-1.5 sm:gap-2 sm:px-2.5"
          title="{$t('nav.latexLabel')}: {latexLabel} – {latexTitle}"
          aria-label={$t("nav.latexMode", { mode: latexLabel })}
          onclick={onStorageClick}
        >
          <span class="font-serif text-xs font-bold tracking-tight opacity-70" aria-hidden="true">TeX</span>
          <Icon icon={latexPlaceIcons[latexCompilation]} />
          <span class="hidden truncate xl:inline">{$t("nav.latexLabel")}: {latexLabel}</span>
        </button>
      </div>

      {#if $smUp}
        <Menu
          label={$t("nav.workspace")}
          icon={faFolderOpen}
          labelClass="hidden 2xl:inline"
          triggerClass={control}
        >
          {@render workspaceItems()}
        </Menu>
      {/if}
      {/if}
    {/if}

    <button
      type="button"
      class={control}
      title={$t("statusBar.languageHint", { language: LOCALE_LABELS[nextLocale] })}
      aria-label={$t("statusBar.languageHint", { language: LOCALE_LABELS[nextLocale] })}
      onclick={toggleLocale}
    >
      {$locale.toUpperCase()}
    </button>

    <Menu
      label={$t("nav.theme")}
      icon={$theme === "dark" ? faMoon : faSun}
      showLabel={false}
      chevron={false}
      triggerClass={iconControl}
    >
      {#each themeOptions as pref}
        <MenuItem
          icon={themeIcons[pref]}
          checked={$themePreference === pref}
          onSelect={() => setThemePreference(pref)}
        >
          {pref === "system" ? $t("nav.themeSystem") : pref === "light" ? $t("nav.themeLight") : $t("nav.themeDark")}
        </MenuItem>
      {/each}
    </Menu>

    <button
      type="button"
      class="{iconControl} relative"
      title={$t("help.ui.statusBarHint")}
      aria-label={$t("help.ui.openHelp")}
      onclick={onHelpClick}
    >
      <Icon icon={faCircleQuestion} class="text-lg" />
      {#if helpUnseen}
        <span class="absolute top-2 right-2 size-2 rounded-full bg-warning" aria-hidden="true"></span>
      {/if}
    </button>

    {#if variant === "full"}
      <Menu
        label={userEmail || $t("nav.account")}
        icon={faCircleUser}
        labelClass="hidden max-w-[14rem] 2xl:inline"
        triggerClass={control}
      >
        <p class="m-0 px-3 pt-2 pb-1 text-xs text-muted">
          {authenticated ? $t("workspace.session.cloudMode") : $t("workspace.session.localMode")}
        </p>
        {#if !isAdmin && !$smUp}
          {@render workspaceItems()}
          <div role="separator" class="my-1 border-t border-line"></div>
        {/if}
        <MenuItem icon={faGear} href="/settings">{$t("nav.settings")}</MenuItem>
        <MenuItem icon={authenticated ? faArrowRightFromBracket : faLock} onSelect={onLock}>
          {authenticated ? $t("workspace.session.lockSession") : $t("workspace.session.lock")}
        </MenuItem>
      </Menu>
    {/if}
  </div>
</header>
