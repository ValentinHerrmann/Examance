<script lang="ts">
  /** Sets up a passkey as the second factor, from the enrollment scope (issue #72). No vault is open yet: the data wrap comes from the sign-in that follows, whose assertion carries the PRF secret (`passkeyToHeal` in the unlock route). */
  import { Alert, Button, Modal } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { registrationOptions, verifyRegistration } from "#lib/api/webauthn";
  import { register } from "#lib/webauthn/client";

  interface Props {
    onEnrolled: () => void;
    onUseTotp: () => void;
  }

  let { onEnrolled, onUseTotp }: Props = $props();

  let errorMsg = $state("");
  let isWorking = $state(false);

  async function create() {
    if (isWorking) {
      return;
    }
    isWorking = true;
    errorMsg = "";
    try {
      const options = await registrationOptions();
      const result = await register(options);
      await verifyRegistration({
        handle: options.handle,
        challenge_b64: options.challenge_b64,
        credential_json: result.credentialJson,
        supports_prf: result.supportsPrf,
        nickname: null,
      });
      onEnrolled();
    } catch {
      errorMsg = $t("security.enrollPasskey.failed");
    } finally {
      isWorking = false;
    }
  }
</script>

<Modal
  open={true}
  size="medium"
  title={$t("security.enroll.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <div class="flex flex-col gap-4">
    <p class="m-0 text-sm text-muted">{$t("security.enrollPasskey.intro")}</p>
    <p class="m-0 text-sm text-content">{$t("security.enrollPasskey.explain")}</p>
    {#if errorMsg}
      <Alert severity="danger">{errorMsg}</Alert>
    {/if}
  </div>

  {#snippet footer()}
    <Button severity="secondary" disabled={isWorking} onClick={onUseTotp}>
      {$t("security.enrollPasskey.useTotp")}
    </Button>
    <Button disabled={isWorking} loading={isWorking} onClick={create}>
      {isWorking ? $t("security.enrollPasskey.working") : $t("security.enrollPasskey.create")}
    </Button>
  {/snippet}
</Modal>
