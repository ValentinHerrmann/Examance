<script lang="ts">
  /** Remaining login cooloff (doubles per failure, 1 min to 1 h). Reads the store directly rather than drilling through UnlockForm → FactorChooser → TotpFactor. */
  import { onDestroy, untrack } from "svelte";
  import { t } from "$lib/i18n";
  import { Alert } from "$lib/components/ui";
  import {
    formatRemaining,
    loginLockout,
    remainingSeconds,
  } from "$lib/stores/loginLockout";

  let remaining = $state(0);

  // Recomputed on every tick *and* whenever the deadline changes, so a second
  // rejection showing less time left replaces the first without waiting.
  $effect.pre(() => {
    const lockedUntil = $loginLockout.lockedUntil;
    untrack(() => {
      remaining = remainingSeconds(lockedUntil);
    });
  });

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
  <Alert severity="warning" class="mb-4 w-full max-w-form">
    <p class="m-0 font-semibold">{$t("security.lockout.title")}</p>
    <p class="m-0 mt-1">
      {$t("security.lockout.retryIn", { time: formatRemaining(remaining) })}
    </p>
  </Alert>
{/if}
