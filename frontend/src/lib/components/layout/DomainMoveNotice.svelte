<script lang="ts">
  /** Domain move (issue #198, docs/domain_move.md). Old address: a warning with the deadline and a move checklist. New address: a reminder while the account has only passkeys of the old one. */
  import { faArrowUpRightFromSquare, faListCheck } from "@fortawesome/free-solid-svg-icons";
  import { untrack } from "svelte";
  import { Alert, Button, Modal } from "#lib/components/ui";
  import { locale, t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { docsHref } from "#lib/help/docsLink";
  import { listPasskeys } from "#lib/api/webauthn";
  import { isUnlocked } from "#lib/stores/session";
  import { storagePolicyStore } from "#lib/stores/storagePolicy";
  import { deadlineDate, domainMove, newHost, onNewAddress, onOldAddress } from "#lib/domainMove";

  const DISMISSED_KEY = "examance.domainMoveDismissed";

  const oldAddress = onOldAddress();
  const newAddress = onNewAddress();
  const deadline = deadlineDate();
  const newOrigin = domainMove?.to ?? "";

  function readDismissed(): boolean {
    try { return sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
  }

  let dismissed = $state(readDismissed());
  let guideOpen = $state(false);
  /** New address only: the account signs in with passkeys, all of them made for the old address. */
  let onlyOldPasskeys = $state(false);

  let vars = $derived({
    from: domainMove?.from ?? "",
    host: newHost(),
    date: deadline ? $fmt.date(deadline) : "",
  });
  let hybrid = $derived($isUnlocked && $storagePolicyStore.storageMode === "hybrid");

  function dismiss() {
    dismissed = true;
    try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch { /* storage may be blocked */ }
  }

  async function checkPasskeys() {
    try {
      const passkeys = await listPasskeys();
      onlyOldPasskeys = passkeys.length > 0 && passkeys.every((p) => p.legacy);
    } catch {
      onlyOldPasskeys = false;
    }
  }

  const STEPS = ["results", "signIn", "passkey", "dataAccess", "bookmarks", "cleanup"] as const;

  $effect.pre(() => {
    const signedIn = $isUnlocked;
    untrack(() => {
      if (newAddress && signedIn) void checkPasskeys();
      else onlyOldPasskeys = false;
    });
  });
</script>

{#if domainMove && oldAddress && !dismissed}
  <Alert severity="warning" title={$t("domainMove.title", vars)} class="mx-3 mt-2 sm:mx-4" onDismiss={dismiss}>
    {$t("domainMove.body", vars)}
    {#snippet actions()}
      <Button icon={faListCheck} onClick={() => (guideOpen = true)}>{$t("domainMove.howTo")}</Button>
      <Button variant="outlined" severity="secondary" icon={faArrowUpRightFromSquare} href={newOrigin} target="_blank" rel="noopener">
        {$t("domainMove.openNew", vars)}
      </Button>
    {/snippet}
  </Alert>
{:else if domainMove && newAddress && onlyOldPasskeys && !dismissed}
  <Alert severity="info" title={$t("domainMove.newPasskeyTitle", vars)} class="mx-3 mt-2 sm:mx-4" onDismiss={dismiss}>
    {$t("domainMove.newPasskeyBody", vars)}
    {#snippet actions()}
      <Button href="/settings#security">{$t("domainMove.toSecurity")}</Button>
    {/snippet}
  </Alert>
{/if}

<Modal open={guideOpen} title={$t("domainMove.guideTitle", vars)} onClose={() => (guideOpen = false)}>
  <p class="mt-0 text-sm text-muted">{$t("domainMove.guideIntro", vars)}</p>
  <ol class="m-0 flex flex-col gap-3 pl-5 text-sm text-content">
    {#each STEPS as step (step)}
      <li class={step === "results" && hybrid ? "border-l-4 border-warning pl-2" : ""}>
        <strong class="block">{$t(`domainMove.steps.${step}.title`, vars)}</strong>
        <span class="text-muted">{$t(`domainMove.steps.${step}.body`, vars)}</span>
      </li>
    {/each}
  </ol>
  {#snippet footer()}
    <a href={docsHref("security#domain-move", $locale)} class="link mr-auto text-sm" target="_blank" rel="noopener noreferrer">
      {$t("domainMove.docs")}
    </a>
    <Button variant="outlined" severity="secondary" onClick={() => (guideOpen = false)}>{$t("domainMove.close")}</Button>
    <Button icon={faArrowUpRightFromSquare} href={newOrigin} target="_blank" rel="noopener">{$t("domainMove.openNew", vars)}</Button>
  {/snippet}
</Modal>
