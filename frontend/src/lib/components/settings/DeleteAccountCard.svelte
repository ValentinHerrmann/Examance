<script lang="ts">
  // Deleting one's own account (GDPR Art. 17, `DELETE /user/me`). Typing the address is the
  // confirmation; afterwards this browser's copy is wiped and the tab returns to the sign-in page.
  import { ApiError, api } from "#lib/api/client";
  import { t } from "#lib/i18n";
  import { Alert, Button, Card, Field, TextInput } from "#lib/components/ui";
  import { wipeDatabase } from "#lib/db/hygiene";
  import { clearCapabilities } from "#lib/stores/capabilities";
  import { sessionStore } from "#lib/stores/session";

  interface Props {
    email: string;
  }

  let { email }: Props = $props();

  let typed = $state("");
  let busy = $state(false);
  let error = $state("");
  let confirmed = $derived(typed.trim().toLowerCase() === email.trim().toLowerCase() && email !== "");

  async function remove() {
    if (!confirmed || busy) return;
    busy = true;
    error = "";
    try {
      await api.delete("/user/me", { silentError: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : $t("settings.deleteAccount.failed");
      busy = false;
      return;
    }
    // The server session ended with the account; drop everything this browser still holds.
    await wipeDatabase();
    clearCapabilities();
    sessionStore.lock();
    window.location.href = "/unlock";
  }
</script>

<Card tone="danger" title={$t("settings.deleteAccount.heading")}>
  <p class="mt-0 mb-4 text-sm text-muted">{$t("settings.deleteAccount.description")}</p>
  {#if error}<Alert severity="danger" class="mb-4">{error}</Alert>{/if}
  <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); remove(); }}>
    <Field label={$t("settings.deleteAccount.confirmLabel", { email })} forId="delete-account-email">
      <TextInput id="delete-account-email" type="email" bind:value={typed} autocomplete="off" disabled={busy} />
    </Field>
    <div>
      <Button type="submit" severity="danger" loading={busy} disabled={!confirmed} class="w-full sm:w-auto">
        {busy ? $t("settings.deleteAccount.deleting") : $t("settings.deleteAccount.button")}
      </Button>
    </div>
  </form>
</Card>
