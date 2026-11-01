<script lang="ts">
  /** Domain move (issue #198): on the new address, signs in with a passkey of the old one (related origins, `/.well-known/webauthn`). Renders nothing elsewhere. */
  import { Button } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { domainMove, onNewAddress } from "#lib/domainMove";

  interface Props {
    onClick: () => void;
    disabled?: boolean;
  }

  let { onClick, disabled = false }: Props = $props();

  const show = onNewAddress();
</script>

{#if show && domainMove}
  <Button variant="text" severity="secondary" size="sm" block {disabled} {onClick}>
    {$t("domainMove.legacyPasskey", { from: domainMove.from })}
  </Button>
{/if}
