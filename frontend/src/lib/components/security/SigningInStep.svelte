<script lang="ts">
  /**
   * Both factors are in; the browser is opening the vault.
   *
   * This exists because the page had nothing to render for it. The step chain
   * matched `factor_required` and the vault prompt and fell through to the
   * login form for everything else — including the one to three seconds
   * Argon2id spends deriving the key-encryption key. So a successful sign-in
   * looked like being bounced back to an empty login page, and then, without
   * explanation, landing on the dashboard.
   *
   * Naming the account is the point: the reassurance needed here is that the
   * credentials were accepted and the wait is decryption, not a stalled request.
   */
  import { t } from "$lib/i18n";

  export let email: string;
</script>

<div class="flex w-full flex-col items-center gap-4 py-4 text-center">
  <div
    class="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-accent"
    role="status"
    aria-label={$t("security.signingIn.title")}
  ></div>

  <div>
    <h2 class="m-0 text-lg font-semibold text-accent">{$t("security.signingIn.title")}</h2>
    <p class="mt-1 text-sm text-muted">{$t("security.signingIn.body")}</p>
  </div>

  <p class="m-0 text-xs text-subtle">{$t("security.signingIn.as", { email })}</p>
</div>
