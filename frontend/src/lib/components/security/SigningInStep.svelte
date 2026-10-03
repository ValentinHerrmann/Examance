<script lang="ts">
  /** Both factors are in and the browser is opening the vault (Argon2id takes 1-3 s). Shown so a successful sign-in is not mistaken for a bounce back to the login page; names the account to reassure that the wait is decryption. */
  import { t } from "#lib/i18n";

  interface Props {
    email: string;
  }

  let { email }: Props = $props();
</script>

<div class="flex w-full flex-col items-center gap-4 py-4 text-center">
  <div
    class="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-accent"
    role="status"
    aria-label={$t("security.signingIn.title")}
  ></div>

  <div>
    <h2 class="m-0 text-xl font-medium text-content">{$t("security.signingIn.title")}</h2>
    <p class="mt-1 text-sm text-muted">{$t("security.signingIn.body")}</p>
  </div>

  <p class="m-0 text-xs text-muted">{$t("security.signingIn.as", { email })}</p>
</div>
