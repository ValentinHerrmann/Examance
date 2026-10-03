<script lang="ts">
  import { page } from "$app/stores";
  import {
    faArrowRightFromBracket,
    faBars,
    faCircleHalfStroke,
    faCircleQuestion,
    faCircleUser,
    faCloud,
    faFileExport,
    faFileImport,
    faFolderOpen,
    faGear,
    faLock,
    faMoon,
    faShieldHalved,
    faShuffle,
    faSun,
    faTrashCan,
    faTriangleExclamation,
  } from "@fortawesome/free-solid-svg-icons";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { locale, t, toggleLocale, LOCALE_LABELS, type Locale } from "$lib/i18n";
  import type { StorageMode } from "$lib/stores/storagePolicy";
  import type { VersionStatus } from "$lib/stores/versionStore";
  import { themePreference, setThemePreference, theme, type ThemePreference } from "$lib/stores/theme";
  import { mobileNavOpen } from "$lib/stores/shell";
  import { Icon, Menu, MenuItem } from "$lib/components/ui";

  /**
   * Artemis navbar: dark slate in both themes. Brand and (from `xl`) the main
   * links on the left; storage mode, workspace, language, theme, help and the
   * account on the right. Below `xl` the links move into the drawer behind
   * the burger at the far left — at 1024px (iPad portrait) they do not fit
   * beside the right-hand cluster.
   *
   * `minimal` is for locked and public pages: brand, language, theme, help.
   */
  export let variant: "full" | "minimal" = "full";
  export let authenticated = false;
  export let userRole: string | null = null;
  export let userEmail: string | null = null;
  export let storageMode: StorageMode = "all-local";
  export let storageLabel = "";
  export let storageTitle = "";
  export let versionStatus: VersionStatus = "no-server";
  export let helpUnseen = false;
  export let onStorageClick: () => void = () => {};
  export let onHelpClick: () => void = () => {};
  export let onOpenArchive: () => void = () => {};
  export let onExportArchive: () => void = () => {};
  export let onClearWorkspace: () => void = () => {};
  export let onLock: () => void = () => {};

  $: links = [
    { href: "/", label: $t("nav.dashboard") },
    { href: "/exercises", label: $t("nav.exerciseLibrary") },
    { href: "/analytics", label: $t("nav.analytics") },
    ...(userRole === "admin" ? [{ href: "/admin/users", label: $t("nav.userManagement") }] : []),
    { href: "/settings", label: $t("nav.settings") },
    { href: "/help", label: $t("help.ui.navLabel") },
  ];

  $: currentPath = $page.url.pathname;
  $: isActive = (href: string) => (href === "/" ? currentPath === "/" : currentPath.startsWith(href));

  const storageIcons: Record<StorageMode, IconDefinition> = {
    "all-local": faShieldHalved,
    "all-server": faCloud,
    hybrid: faShuffle,
  };

  const themeIcons: Record<ThemePreference, IconDefinition> = {
    system: faCircleHalfStroke,
    light: faSun,
    dark: faMoon,
  };

  const themeOptions: ThemePreference[] = ["system", "light", "dark"];

  $: nextLocale = ($locale === "de" ? "en" : "de") as Locale;

  /* One look for every control on the slate bar. */
  const control =
    "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-sm font-medium " +
    "text-navbar-muted no-underline hover:bg-navbar-hover hover:text-navbar-content " +
    "aria-expanded:bg-navbar-hover aria-expanded:text-navbar-content pointer-coarse:min-h-11";
  const iconControl = control + " w-10 justify-center px-0 pointer-coarse:w-11";
</script>

<header
  class="flex min-h-14 shrink-0 items-center gap-1 bg-navbar px-2 pt-[env(safe-area-inset-top)] text-navbar-content sm:gap-2 sm:px-4"
>
  {#if variant === "full"}
    <button
      type="button"
      class="{iconControl} xl:hidden"
      aria-label={$t("nav.openMenu")}
      aria-expanded={$mobileNavOpen}
      on:click={() => mobileNavOpen.set(!$mobileNavOpen)}
    >
      <Icon icon={faBars} class="text-lg" />
    </button>
  {/if}

  <a
    href="/"
    class="mr-2 inline-flex min-h-10 shrink-0 items-center gap-2.5 rounded-md px-1 text-lg font-semibold text-navbar-content no-underline"
  >
    <img src="/favicon.png" alt={$t("nav.logoAlt")} class="size-7 rounded-sm object-contain" />
    <span class="hidden sm:inline">Examance</span>
  </a>

  {#if variant === "full"}
    <nav class="hidden h-14 items-stretch xl:flex" aria-label={$t("nav.menuLabel")}>
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
          class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold {versionStatus ===
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

      <button
        type="button"
        class="{control} max-w-[16rem]"
        title={storageTitle || $t("statusBar.storageSettingsHint")}
        aria-label={$t("nav.storageMode", { mode: storageLabel })}
        on:click={onStorageClick}
      >
        <Icon icon={storageIcons[storageMode]} />
        <span class="hidden truncate 2xl:inline">{storageLabel}</span>
      </button>

      <Menu
        label={$t("nav.workspace")}
        icon={faFolderOpen}
        labelClass="hidden 2xl:inline"
        triggerClass={control}
      >
        <MenuItem icon={faFileImport} onSelect={onOpenArchive}>{$t("workspace.menu.open")}</MenuItem>
        <MenuItem icon={faFileExport} onSelect={onExportArchive}>{$t("workspace.menu.export")}</MenuItem>
        <MenuItem icon={faTrashCan} danger onSelect={onClearWorkspace}>{$t("workspace.menu.clear")}</MenuItem>
      </Menu>
    {/if}

    <button
      type="button"
      class={control}
      title={$t("statusBar.languageHint", { language: LOCALE_LABELS[nextLocale] })}
      aria-label={$t("statusBar.languageHint", { language: LOCALE_LABELS[nextLocale] })}
      on:click={toggleLocale}
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
      on:click={onHelpClick}
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
        <MenuItem icon={faGear} href="/settings">{$t("nav.settings")}</MenuItem>
        {#if !authenticated}
          <MenuItem icon={faCloud} href="/unlock">{$t("workspace.session.connectToCloud")}</MenuItem>
        {/if}
        <MenuItem icon={authenticated ? faArrowRightFromBracket : faLock} onSelect={onLock}>
          {authenticated ? $t("workspace.session.lockSession") : $t("workspace.session.lock")}
        </MenuItem>
      </Menu>
    {/if}
  </div>
</header>
