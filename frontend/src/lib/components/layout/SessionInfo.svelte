<script lang="ts">
  import { t } from "$lib/i18n";

  export let onLock: () => void;
  export let authenticated: boolean = false;
  export let userRole: string | null = null;
  export let userEmail: string | null = null;
  /** Vertical arrangement for the mobile slide-over. */
  export let stacked = false;

  const badgeBase = "rounded px-2 py-1 text-xs font-semibold capitalize whitespace-nowrap";
  const btnBase =
    "inline-flex min-h-9 cursor-pointer items-center rounded border-none px-3 py-1.5 text-sm font-medium no-underline";
</script>

<div
  class="flex min-w-0 items-center gap-2 {stacked
    ? 'flex-col items-stretch gap-2 px-2'
    : 'sm:gap-3'}"
>
  {#if authenticated}
    <span class="{badgeBase} bg-accent-strong text-white">
      {$t("workspace.session.cloudMode")}
    </span>
    {#if userEmail}
      <span
        class="min-w-0 truncate text-sm text-muted {stacked ? '' : 'hidden xl:inline'}"
        title={userEmail}
      >
        {userEmail}
      </span>
    {/if}
    <button class="{btnBase} bg-surface-inset text-content hover:bg-line-strong" on:click={onLock}>
      {$t("workspace.session.lockSession")}
    </button>
  {:else}
    <span class="{badgeBase} border border-accent-strong bg-surface-inset text-accent">
      {$t("workspace.session.localMode")}
    </span>
    <a
      href="/unlock"
      class="{btnBase} justify-center bg-accent-strong font-semibold text-white hover:bg-accent-hover"
    >
      {$t("workspace.session.connectToCloud")}
    </a>
    <button
      class="{btnBase} justify-center bg-surface-inset text-content hover:bg-line-strong"
      on:click={onLock}
    >
      {$t("workspace.session.lock")}
    </button>
  {/if}
</div>
