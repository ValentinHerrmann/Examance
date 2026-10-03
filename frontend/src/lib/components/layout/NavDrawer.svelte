<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { page } from "$app/stores";
  import { afterNavigate } from "$app/navigation";
  import { faXmark } from "@fortawesome/free-solid-svg-icons";
  import { t } from "$lib/i18n";
  import { mobileNavOpen, examNavContext } from "$lib/stores/shell";
  import { lockScroll } from "$lib/utils/scrollLock";
  import { Badge, Button, Icon } from "$lib/components/ui";
  import { examNavItems } from "./examNavItems";

  /**
   * Navigation drawer below `xl`, opened by the navbar burger. Lists the current exam's steps first (phones have no
   * exam sidebar), then the main links; workspace and account actions stay in the navbar menus.
   */
  interface Props {
    userRole?: string | null;
  }

  let { userRole = null }: Props = $props();

  let links = $derived([
    { href: "/", label: $t("nav.dashboard") },
    { href: "/exercises", label: $t("nav.exerciseLibrary") },
    { href: "/analytics", label: $t("nav.analytics") },
    ...(userRole === "admin" ? [{ href: "/admin/users", label: $t("nav.userManagement") }] : []),
    { href: "/settings", label: $t("nav.settings") },
    { href: "/help", label: $t("help.ui.navLabel") },
  ]);

  let currentPath = $derived($page.url.pathname);
  function isActive(href: string) {
    return href === "/" ? currentPath === "/" : currentPath.startsWith(href);
  }
  let examItems = $derived($examNavContext ? examNavItems($examNavContext.examId, currentPath) : []);

  let release: (() => void) | null = null;
  $effect.pre(() => {
    const isOpen = $mobileNavOpen;
    if (typeof document === "undefined") return;
    untrack(() => {
      if (isOpen && !release) release = lockScroll();
      else if (!isOpen && release) {
        release();
        release = null;
      }
    });
  });
  onDestroy(() => release?.());

  afterNavigate(() => mobileNavOpen.set(false));

  function close() {
    mobileNavOpen.set(false);
  }

  const row =
    "flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-medium no-underline";
</script>

<svelte:window onkeydown={(e) => $mobileNavOpen && e.key === "Escape" && close()} />

{#if $mobileNavOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-backdrop xl:hidden" style="z-index: var(--z-dropdown)" onclick={close}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <nav
      class="scroll-pane flex h-full w-[min(20rem,85vw)] flex-col gap-1 overflow-y-auto bg-surface-raised p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl"
      aria-label={$t("nav.menuLabel")}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between px-1 pb-1">
        <span class="px-2 text-lg font-semibold text-content">Examance</span>
        <Button variant="text" severity="secondary" iconOnly icon={faXmark} ariaLabel={$t("nav.closeMenu")} onClick={close} />
      </div>

      {#if $examNavContext && examItems.length}
        <p class="m-0 truncate px-3 pt-2 pb-1 text-sm font-semibold text-content">
          {$examNavContext.exam?.title || $t("exam.nav.examFallback")}
        </p>
        <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
          {#each examItems as item (item.step)}
            <li>
              <a
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                class="{row} {item.active ? 'bg-highlight text-on-highlight' : 'text-content hover:bg-surface-inset'}"
              >
                <Icon icon={item.icon} class="w-5 text-muted" />
                <span class="min-w-0 flex-1 truncate">{$t(item.labelKey)}</span>
                {#if item.step === "scan" && $examNavContext.submissionCount > 0}
                  <Badge size="xs">{$examNavContext.submissionCount}</Badge>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
        <hr class="my-2 border-line" />
      {/if}

      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        {#each links as link (link.href)}
          <li>
            <a
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              class="{row} {isActive(link.href) ? 'bg-highlight text-on-highlight' : 'text-content hover:bg-surface-inset'}"
            >
              {link.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </div>
{/if}
