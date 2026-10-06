<script lang="ts">
  // The page behind the mailed self-deletion link (GDPR Art. 17). Opening it deletes nothing (a mail
  // scanner may open links); it shows what goes and deletes only on the button. No sign-in needed:
  // the single-use link proves the mailbox, and the holder asked for it while signed in.
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { apiErrorMessage, ApiError } from "#lib/api/client";
  import { confirmAccountDeletion, previewAccountDeletion, type AccountDeletionPreview } from "#lib/api/account";
  import { t, translate } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { takeUrlToken } from "#lib/utils/urlToken";
  import { Alert, Button } from "#lib/components/ui";
  import AuthCard from "#lib/components/unlock/AuthCard.svelte";
  import { currentManifest, replaceWorkspace } from "#lib/db/workspace";
  import { backendStore } from "#lib/stores/backendStore";
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
    return apiErrorMessage(err, fallback);
  }

  onMount(async () => {
    token = takeUrlToken();
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

  /** Clears what this browser holds of the deleted account; the mailed link usually opens in a new tab. */
  async function forgetLocally(email: string) {
    const same = (other: string | null | undefined) => !!other && other.toLowerCase() === email.toLowerCase();
    const signedIn = same($sessionStore.email);
    if (signedIn) {
      clearCapabilities();
      sessionStore.lock();
    }
    const owner = (await currentManifest())?.owner;
    if (signedIn || (same(owner?.accountEmail) && owner?.backendOrigin === (get(backendStore) || null))) {
      await replaceWorkspace(null);
    }
  }

  async function confirm() {
    if (busy || !preview) return;
    busy = true;
    errorMsg = "";
    try {
      await confirmAccountDeletion(token);
    } catch (err) {
      errorMsg = describe(err, translate("auth.deleteAccount.failed"));
      busy = false;
      return;
    }
    try {
      await forgetLocally(preview.email);
    } catch (err) {
      console.warn("[delete-account] could not clear this browser's data", err);
    }
    deleted = true;
    busy = false;
  }
</script>

<AuthCard title={$t("auth.deleteAccount.title")}>

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
</AuthCard>
