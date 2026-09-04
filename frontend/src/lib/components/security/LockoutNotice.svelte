<script lang="ts">
  /**
   * How long a login cooloff still has to run.
   *
   * The wait doubles with each failure past the threshold — one minute to an
   * hour — so "try again later" left the only sensible move being to keep
   * trying, which never works and never explains itself.
   *
   * Subscribes to the store directly rather than taking a prop: it is one
   * ticking value, and threading it through UnlockForm → FactorChooser →
   * TotpFactor would be worse than the prop-drilling rule is meant to prevent.
   */
  import { onDestroy } from "svelte";
  import { t } from "$lib/i18n";
  import {
    formatRemaining,
    loginLockout,
    remainingSeconds,
  } from "$lib/stores/loginLockout";

  let remaining = 0;

  // Recomputed on every tick *and* whenever the deadline changes, so a second
  // rejection showing less time left replaces the first without waiting.
  $: remaining = remainingSeconds($loginLockout.lockedUntil);

  const timer = setInterval(() => {
    remaining = remainingSeconds($loginLockout.lockedUntil);
    if ($loginLockout.lockedUntil !== null && remaining === 0) {
      // Clears itself exactly when retrying starts working again, so nobody is
      // left looking at a stale "wait" they have already waited out.
      loginLockout.clear();
    }
  }, 1000);

  onDestroy(() => clearInterval(timer));
</script>

{#if remaining > 0}
  <div
    class="mb-4 w-full max-w-form rounded-lg border border-line-strong bg-surface-sunken p-3"
    role="alert"
    aria-live="polite"
  >
    <p class="m-0 text-sm font-medium text-content">{$t("security.lockout.title")}</p>
    <p class="m-0 mt-1 text-sm text-muted">
      {$t("security.lockout.retryIn", { time: formatRemaining(remaining) })}
    </p>
  </div>
{/if}
