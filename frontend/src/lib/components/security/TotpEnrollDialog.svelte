<script lang="ts">
  /**
   * Sets up the authenticator factor.
   *
   * Reached from the enrollment scope, which is where an account with only one
   * factor is held — so this is the screen every existing account sees on its
   * first sign-in after the policy landed, and it has to be able to complete
   * without a full session.
   *
   * The QR code is rendered here from the bundled `qrcode` dependency. Not a
   * design preference: the Content-Security-Policy is `script-src 'self'`, and
   * the shared secret must not be handed to a third-party QR service anyway.
   */
  import QRCode from "qrcode";
  import { onMount } from "svelte";
  import { Button, Field, Modal, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { confirmTotpEnrollment, startTotpEnrollment } from "$lib/api/mfa";

  export let onEnrolled: (backupCodes: string[]) => void;

  let otpauthUri = "";
  let qrDataUrl = "";
  let manualKey = "";
  let code = "";
  let errorMsg = "";
  let isWorking = false;

  onMount(async () => {
    try {
      otpauthUri = await startTotpEnrollment();
      qrDataUrl = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: "M", margin: 1 });
      manualKey = new URL(otpauthUri).searchParams.get("secret") ?? "";
    } catch {
      errorMsg = $t("security.enroll.failed");
    }
  });

  async function confirm() {
    if (!code.trim() || isWorking) {
      return;
    }
    isWorking = true;
    errorMsg = "";
    try {
      onEnrolled(await confirmTotpEnrollment(code.trim()));
    } catch {
      errorMsg = $t("security.enroll.invalid");
    } finally {
      isWorking = false;
    }
  }
</script>

<Modal
  open={true}
  size="md"
  title={$t("security.enroll.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <form class="flex flex-col gap-4" on:submit|preventDefault={confirm}>
    <p class="text-sm text-muted">{$t("security.enroll.intro")}</p>

    <p class="text-sm text-content">{$t("security.enroll.step1")}</p>

    {#if qrDataUrl}
      <img
        src={qrDataUrl}
        alt=""
        class="mx-auto h-48 w-48 rounded-lg bg-white p-2"
        width="192"
        height="192"
      />
    {/if}

    {#if manualKey}
      <div class="min-w-0">
        <p class="m-0 text-xs text-subtle">{$t("security.enroll.manualHint")}</p>
        <code
          class="mt-1 block overflow-x-auto rounded-md bg-surface-inset px-3 py-2
                 font-mono text-xs tracking-widest text-content select-all"
        >
          {manualKey}
        </code>
      </div>
    {/if}

    <p class="text-sm text-content">{$t("security.enroll.step2")}</p>

    <Field label={$t("security.enroll.codeLabel")} error={errorMsg}>
      <TextInput
        bind:value={code}
        placeholder="000000"
        class="font-mono text-lg tracking-[0.3em]"
      />
    </Field>
  </form>

  <svelte:fragment slot="footer">
    <Button disabled={isWorking || !code.trim()} loading={isWorking} onClick={confirm}>
      {isWorking ? $t("security.enroll.working") : $t("security.enroll.confirm")}
    </Button>
  </svelte:fragment>
</Modal>
