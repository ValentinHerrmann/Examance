<script lang="ts">
  /** Domain move (issue #198, docs/hosting.md "Moving to a new domain"). Old address: a notice before sign-in, and anyone with nothing to take along is sent on; hybrid accounts get `DomainMoveHybridPanel`. New address: an account whose passkeys all belong to the old address must create one here. */
  import { faArrowUpRightFromSquare, faKey } from "@fortawesome/free-solid-svg-icons";
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import { Alert, Button, HeroDialog } from "#lib/components/ui";
  import { t, translate } from "#lib/i18n";
  import { listPasskeys } from "#lib/api/webauthn";
  import { lockSession } from "#lib/db/hygiene";
  import { addPasskey } from "#lib/services/passkeyRegistration";
  import { isUnlocked, sessionStore } from "#lib/stores/session";
  import { storagePolicyStore } from "#lib/stores/storagePolicy";
  import { workspaceStatusStore } from "#lib/stores/workspaceState";
  import {
    domainMove,
    newAddressHref,
    newHost,
    onNewAddress,
    onOldAddress,
    rememberOldPasskeySignIn,
    signedInWithOldPasskey,
  } from "#lib/domainMove";

  const DEFERRED_KEY = "examance.domainMovePasskeyLater";

  const oldAddress = onOldAddress();
  const newAddress = onNewAddress();

  /** New address: every passkey of the account belongs to the old address. */
  let onlyOldPasskeys = $state(false);
  let deferred = $state(readDeferred());
  let creating = $state(false);
  let createError = $state("");

  let vars = $derived({ from: domainMove?.from ?? "", host: newHost() });
  // Forced after a sign-in with an old passkey; otherwise it may wait for later (once per tab).
  let forced = $derived($isUnlocked && signedInWithOldPasskey());
  let dialogOpen = $derived(newAddress && $isUnlocked && onlyOldPasskeys && (forced || !deferred));

  function readDeferred(): boolean {
    try { return sessionStorage.getItem(DEFERRED_KEY) === "1"; } catch { return false; }
  }

  function later() {
    deferred = true;
    try { sessionStorage.setItem(DEFERRED_KEY, "1"); } catch { /* storage may be blocked */ }
  }

  async function signOut() {
    rememberOldPasskeySignIn(false);
    await lockSession();
  }

  async function checkPasskeys() {
    try {
      const passkeys = await listPasskeys();
      onlyOldPasskeys = passkeys.length > 0 && passkeys.every((p) => p.legacy);
    } catch {
      onlyOldPasskeys = false;
    }
  }

  async function createPasskey() {
    const teacherId = $sessionStore.teacherId;
    if (creating || !teacherId) return;
    creating = true;
    createError = "";
    try {
      await addPasskey(teacherId, null);
      rememberOldPasskeySignIn(false);
      onlyOldPasskeys = false;
    } catch {
      createError = translate("domainMove.createFailed");
    } finally {
      creating = false;
    }
  }

  /** Old address: forward everyone whose work is all on the server; hybrid accounts stay until their results are taken along. */
  function forwardIfNothingToTake(state: string, mode: string | null) {
    const nothingHere = state === "admin" || state === "needs-choice" || (state === "ok" && mode === "all-server");
    if (nothingHere) location.replace(newAddressHref(page.url.pathname + page.url.search + page.url.hash));
  }

  $effect.pre(() => {
    const signedIn = $isUnlocked;
    untrack(() => {
      if (newAddress && signedIn) void checkPasskeys();
      else onlyOldPasskeys = false;
    });
  });

  $effect.pre(() => {
    const state = $workspaceStatusStore.state;
    const mode = $storagePolicyStore.storageMode;
    const signedIn = $isUnlocked;
    if (oldAddress && signedIn) untrack(() => forwardIfNothingToTake(state, mode));
  });
</script>

{#if domainMove && oldAddress && !$isUnlocked}
  <Alert severity="warning" title={$t("domainMove.title", vars)} class="mx-3 mt-2 sm:mx-4">
    {$t("domainMove.body", vars)}
    {#snippet actions()}
      <Button icon={faArrowUpRightFromSquare} href={newAddressHref("/unlock")}>{$t("domainMove.openNew", vars)}</Button>
    {/snippet}
  </Alert>
{/if}

<HeroDialog
  open={dialogOpen}
  icon={faKey}
  tone="info"
  title={$t("domainMove.newPasskeyTitle", vars)}
  body={$t(forced ? "domainMove.newPasskeyForced" : "domainMove.newPasskeyBody", vars)}
  primary={{ label: $t("domainMove.createPasskey", vars), onClick: createPasskey }}
  secondary={forced ? { label: $t("domainMove.signOut"), onClick: signOut } : { label: $t("domainMove.later"), onClick: later }}
  busy={creating}
  error={createError}
/>
