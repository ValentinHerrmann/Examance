<script lang="ts">
  /** Domain move (issue #198): one line on the new address that signs in with a passkey of the old one (related origins, `/.well-known/webauthn`); one line so the sign-in page keeps fitting the viewport. */
  import { t } from "#lib/i18n";
  import { domainMove, showsOldAddressPasskey } from "#lib/domainMove";

  interface Props {
    onClick: () => void;
    disabled?: boolean;
  }

  let { onClick, disabled = false }: Props = $props();

  const show = showsOldAddressPasskey();
</script>

{#if show && domainMove}
  <p class="m-0 text-center text-xs text-muted">
    {$t("domainMove.legacyLine", { from: domainMove.from })}
    <button type="button" class="cursor-pointer border-0 bg-transparent p-0 font-medium text-accent hover:underline disabled:cursor-default disabled:opacity-60" {disabled} onclick={onClick}>{$t("domainMove.legacyLink")}</button>
  </p>
{/if}
