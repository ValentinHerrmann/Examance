<script lang="ts">
  // The page behind the mailed self-deletion link (GDPR Art. 17). Opening it deletes nothing (a mail
  // scanner may open links); it shows what goes and deletes only on the button. No sign-in needed:
  // the single-use link proves the mailbox, and the holder asked for it while signed in.
  import { onMount } from "svelte";
  import { replaceState } from "$app/navigation";
  import { ApiError } from "#lib/api/client";
  import { confirmAccountDeletion, previewAccountDeletion, type AccountDeletionPreview } from "#lib/api/account";
  import { t, translate } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Alert, Button, Card, PageShell } from "#lib/components/ui";
  import { wipeDatabase } from "#lib/db/hygiene";
  import { clearCapabilities } from "#lib/stores/capabilities";
  import { sessionStore } from "#lib/stores/session";

  let token = "";
  let preview = $state<AccountDeletionPreview | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let errorMsg = $state("");
  let tokenInvalid = $state(false);
  let deleted = $state(false);

  function describe(err: unknown, fallback: string): string {
    if (err instanceof ApiError && err.code === "ERR_INVALID_DELETION_TOKEN") tokenInvalid = true;
    return err instanceof ApiError ? err.message : fallback;
  }

  onMount(async () => {
    token = new URLSearchParams(window.location.search).get("token") || "";
    // Keep the single-use token out of the address bar and history from here on.
    replaceState(window.location.pathname, {});
    if (!token) {
      tokenInvalid = true;
      errorMsg = translate("auth.deleteAccount.invalid");
      loading = false;
      return;
    }
    try {
      preview = await previewAccountDeletion(token);
    } catch (err) {
      errorMsg = describe(err, translate("auth.deleteAccount.failed"));
    } finally {
      loading = false;
    }
  });

  async function confirm() {
    if (busy) return;
    busy = true;
    errorMsg = "";
    try {
      await confirmAccountDeletion(token);
    } catch (err) {
      errorMsg = describe(err, translate("auth.deleteAccount.failed"));
      busy = false;
      return;
    }
    // Whatever this browser still holds of the account goes too. A session of the deleted account
    // in this tab ends; one of another account in another tab is left alone (keys are per tab).
    if ($sessionStore.email && preview && $sessionStore.email.toLowerCase() === preview.email.toLowerCase()) {
      await wipeDatabase();
      clearCapabilities();
      sessionStore.lock();
    }
    deleted = true;
    busy = false;
  }
</script>

<PageShell width="form" center>
  <Card class="sm:p-8">
    <div class="mb-6 text-center">
      <img src="/favicon.png" alt="Examance logo" class="mx-auto mb-3 size-14 rounded-xl object-contain" />
      <h1 class="m-0 text-2xl font-normal text-content">{$t("auth.deleteAccount.title")}</h1>
    </div>

    {#if deleted}
      <Alert severity="success" class="mb-5">{$t("auth.deleteAccount.done")}</Alert>
      <div class="text-center">
        <Button href="/unlock" variant="outlined">{$t("auth.deleteAccount.toSignIn")}</Button>
      </div>
    {:else if loading}
      <p class="m-0 text-center text-sm text-muted">{$t("auth.deleteAccount.loading")}</p>
    {:else}
      {#if errorMsg}<Alert severity="danger" class="mb-5">{errorMsg}</Alert>{/if}
      {#if tokenInvalid}
        <p class="m-0 text-sm text-muted">{$t("auth.deleteAccount.invalidHint")}</p>
      {:else if preview}
        <p class="mt-0 mb-3 text-sm text-content break-words">
          {$t("auth.deleteAccount.intro", { email: preview.email })}
        </p>
        <ul class="mt-0 mb-4 flex flex-col gap-1 pl-5 text-sm text-content">
          <li>{$t("auth.deleteAccount.itemData")}</li>
          <li>
            {preview.keep_exercises ? $t("auth.deleteAccount.itemExercisesKept") : $t("auth.deleteAccount.itemExercisesDeleted")}
          </li>
        </ul>
        <Alert severity="warning" class="mb-5">{$t("auth.deleteAccount.final")}</Alert>
        <p class="mt-0 mb-5 text-xs text-muted">
          {$t("auth.deleteAccount.expires", { time: $fmt.dateTime(preview.expires_at) })}
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button severity="danger" loading={busy} onClick={confirm} class="w-full sm:w-auto">
            {$t("auth.deleteAccount.confirm")}
          </Button>
          <Button href="/" variant="outlined" severity="secondary" disabled={busy} class="w-full sm:w-auto">
            {$t("auth.deleteAccount.cancel")}
          </Button>
        </div>
      {/if}
    {/if}
  </Card>
</PageShell>
