<script lang="ts" module>
  /** One notice floating over the scan (pen detected, marks erased with Undo); a new one replaces the old. */
  export interface Notice {
    message: string;
    link?: { href: string; label: string };
    action?: { label: string; onClick: () => void };
    /** Hides itself after this long; without it the notice stays until hidden or replaced. */
    timeoutMs?: number;
    /** Shows the remaining `timeoutMs` as a draining bar. */
    progress?: boolean;
    /** The teacher closed it (×); not called on a timeout or replacement. */
    onClose?: () => void;
  }
</script>

<script lang="ts">
  import { onDestroy } from "svelte";
  import { Alert, Button } from "#lib/components/ui";

  let notice: Notice | null = $state.raw(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  export function show(next: Notice) {
    clearTimeout(timer);
    notice = next;
    if (next.timeoutMs) timer = setTimeout(hide, next.timeoutMs);
  }

  function close() {
    const onClose = notice?.onClose;
    hide();
    onClose?.();
  }

  export function hide() {
    clearTimeout(timer);
    notice = null;
  }

  onDestroy(() => clearTimeout(timer));
</script>

{#snippet actionButton()}
  {@const action = notice?.action}
  {#if action}
    <!-- Take the handler before hiding: `action` follows `notice`, which hide() clears. -->
    <Button size="sm" variant="outlined" onClick={() => { const run = action.onClick; hide(); run(); }}>{action.label}</Button>
  {/if}
{/snippet}

{#if notice}
  <!-- Zero-height sticky row: the notice floats over the scan without moving the pages. -->
  <div class="pointer-events-none sticky top-0 z-10 h-0">
    <!-- Opaque backing: the info tint alone is translucent and let the scan show through. -->
    <div class="pointer-events-auto mx-auto max-w-narrow rounded-md bg-surface-raised shadow-md">
      <Alert severity="info" onDismiss={close} actions={notice.action ? actionButton : undefined}>
        {notice.message}
        {#if notice.link}<a href={notice.link.href} class="link ml-1">{notice.link.label}</a>{/if}
      </Alert>
      {#if notice.progress && notice.timeoutMs}
        {#key notice}
          <div class="h-1 overflow-hidden rounded-b-md" aria-hidden="true">
            <div class="drain h-full origin-left bg-primary" style="animation-duration: {notice.timeoutMs}ms"></div>
          </div>
        {/key}
      {/if}
    </div>
  </div>
{/if}

<style>
  /* The reverse-loading bar of a notice with `progress`. */
  .drain {
    animation-name: drain;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  @keyframes drain {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
