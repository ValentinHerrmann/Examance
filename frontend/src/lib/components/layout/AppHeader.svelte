<script lang="ts">
  import { page } from "$app/stores";
  import { t } from "$lib/i18n";
  import WorkspaceMenu from "./WorkspaceMenu.svelte";
  import SessionInfo from "./SessionInfo.svelte";

  export let isWorkspaceMenuOpen = false;
  export let onToggleWorkspaceMenu: () => void;
  export let onOpenArchive: () => void;
  export let onExportArchive: () => void;
  export let onClearWorkspace: () => void;
  export let onLock: () => void;
  export let authenticated: boolean = false;
  export let userRole: string | null = null;
  export let userEmail: string | null = null;

  /* Below `lg` the link row does not fit next to the brand and the session
   * controls, so it moves into a slide-over panel behind a menu button. */
  let isMobileNavOpen = false;

  $: links = [
    { href: "/", label: $t("nav.dashboard") },
    { href: "/exercises", label: $t("nav.exerciseLibrary") },
    { href: "/analytics", label: $t("nav.analytics") },
    ...(userRole === "admin" ? [{ href: "/admin/users", label: $t("nav.userManagement") }] : []),
    { href: "/settings", label: $t("nav.settings") },
    { href: "/help", label: $t("help.ui.navLabel") },
  ];

  $: currentPath = $page.url.pathname;

  function isActive(href: string): boolean {
    return href === "/" ? currentPath === "/" : currentPath.startsWith(href);
  }

  function closeMobileNav() {
    isMobileNavOpen = false;
  }

  function runAndClose(action: () => void) {
    return () => {
      closeMobileNav();
      action();
    };
  }

  const linkBase =
    "rounded-md px-2 py-1.5 text-sm font-medium no-underline transition-colors hover:text-accent";
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && closeMobileNav()} />

<header
  class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-raised px-3 py-2 sm:px-5 sm:py-3"
>
  <div class="min-w-0 flex-1">
    <a
      href="/"
      class="inline-flex items-center gap-2 text-lg font-bold text-accent no-underline sm:gap-3 sm:text-2xl"
      on:click={closeMobileNav}
    >
      <img
        src="/favicon.png"
        alt={$t("nav.logoAlt")}
        class="h-8 w-8 rounded-md object-contain sm:h-9 sm:w-9"
      />
      <span>Examance</span>
    </a>
  </div>

  <!-- Desktop navigation -->
  <nav class="hidden items-center gap-1 lg:flex xl:gap-3" aria-label={$t("nav.menuLabel")}>
    {#each links as link (link.href)}
      <a
        href={link.href}
        class="{linkBase} {isActive(link.href) ? 'text-accent' : 'text-slate-300'}"
        aria-current={isActive(link.href) ? "page" : undefined}
      >
        {link.label}
      </a>
    {/each}
  </nav>

  <div class="hidden items-center gap-3 lg:flex">
    <div class="relative">
      <button
        class="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface-inset px-2.5 py-1.5 text-xs font-medium text-content hover:bg-line-strong"
        on:click={onToggleWorkspaceMenu}
        aria-expanded={isWorkspaceMenuOpen}
      >
        ⚙️ <span class="hidden xl:inline">{$t("nav.workspace")}</span> ▾
      </button>
      <WorkspaceMenu
        isOpen={isWorkspaceMenuOpen}
        onToggleMenu={onToggleWorkspaceMenu}
        {onOpenArchive}
        {onExportArchive}
        {onClearWorkspace}
      />
    </div>

    <SessionInfo {authenticated} {userRole} {userEmail} {onLock} />
  </div>

  <!-- Mobile / tablet trigger -->
  <button
    class="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-strong bg-surface-inset text-content hover:bg-line-strong lg:hidden"
    aria-expanded={isMobileNavOpen}
    aria-label={$t("nav.menuLabel")}
    on:click={() => (isMobileNavOpen = !isMobileNavOpen)}
  >
    <span aria-hidden="true" class="text-lg leading-none">{isMobileNavOpen ? "✕" : "☰"}</span>
  </button>
</header>

{#if isMobileNavOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm lg:hidden"
    style="z-index: var(--z-dropdown)"
    on:click={closeMobileNav}
  >
    <!-- The stopPropagation keeps a click inside the panel from closing it; the
         backdrop above is the dismiss target and Escape works too. -->
    <nav
      class="scroll-pane ml-auto flex h-full w-[min(20rem,85vw)] flex-col gap-1 overflow-y-auto border-l border-line bg-surface-raised p-3"
      aria-label={$t("nav.menuLabel")}
      on:click|stopPropagation
    >
      {#each links as link (link.href)}
        <a
          href={link.href}
          class="{linkBase} block px-3 py-3 text-base {isActive(link.href)
            ? 'bg-surface-inset text-accent'
            : 'text-slate-200'}"
          aria-current={isActive(link.href) ? "page" : undefined}
          on:click={closeMobileNav}
        >
          {link.label}
        </a>
      {/each}

      <hr class="my-2 border-line" />

      <p class="m-0 px-3 pb-1 text-xs font-semibold tracking-wide text-subtle uppercase">
        {$t("nav.workspace")}
      </p>
      <button
        class="cursor-pointer rounded-md border-none bg-transparent px-3 py-3 text-left text-base text-slate-200 hover:bg-surface-inset"
        on:click={runAndClose(onOpenArchive)}
      >
        {$t("workspace.menu.open")}
      </button>
      <button
        class="cursor-pointer rounded-md border-none bg-transparent px-3 py-3 text-left text-base text-slate-200 hover:bg-surface-inset"
        on:click={runAndClose(onExportArchive)}
      >
        {$t("workspace.menu.export")}
      </button>
      <button
        class="cursor-pointer rounded-md border-none bg-transparent px-3 py-3 text-left text-base text-red-300 hover:bg-red-900 hover:text-white"
        on:click={runAndClose(onClearWorkspace)}
      >
        {$t("workspace.menu.clear")}
      </button>

      <hr class="my-2 border-line" />

      <div class="px-1">
        <SessionInfo {authenticated} {userRole} {userEmail} onLock={runAndClose(onLock)} stacked />
      </div>
    </nav>
  </div>
{/if}
