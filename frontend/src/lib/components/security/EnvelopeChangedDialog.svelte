<script lang="ts">
  import { t } from "#lib/i18n";
  import { ConfirmDialog } from "#lib/components/ui";

  // Asks whether the teacher changed the key copies on another device; the answer is the only thing that may disarm the substitution alarm (`acceptChangedEnvelopes`).
  let resolver: ((accepted: boolean) => void) | null = null;
  let shown = $state(false);

  /** Resolves true only on the explicit accept button; cancel and Escape both refuse. */
  export function open(): Promise<boolean> {
    resolver?.(false);
    shown = true;
    return new Promise((resolve) => (resolver = resolve));
  }

  function answer(accepted: boolean) {
    shown = false;
    const resolve = resolver;
    resolver = null;
    resolve?.(accepted);
  }
</script>

<ConfirmDialog
  open={shown}
  title={$t("security.envelope.changedTitle")}
  message={$t("security.envelope.changedBody")}
  confirmText={$t("security.envelope.changedAccept")}
  cancelText={$t("common.cancel")}
  severity="danger"
  onConfirm={() => answer(true)}
  onCancel={() => answer(false)}
>
  <p class="m-0 leading-normal text-muted">{$t("security.envelope.changedAcceptHint")}</p>
</ConfirmDialog>
