<script lang="ts">
  /** Recovers the data key with the printable recovery code, for when the password wrap is unusable (e.g. a server-side password reset, which cannot re-wrap a key it never saw). */
  import { Button, Field, Modal, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { EnvelopeFactorMissingError } from "$lib/services/keyEnvelopeService";


  interface Props {
    onSubmit: (recoveryCode: string) => Promise<void>;
    /** Start over with a new data key. Irreversible, so confirmed in two steps. */
    onStartFresh?: (() => Promise<void>) | undefined;
    /** Open the vault with a PRF passkey instead; a reset only invalidates the password wrap, so this recovers everything. */
    onPasskey?: (() => Promise<void>) | undefined;
  }

  let { onSubmit, onStartFresh = undefined, onPasskey = undefined }: Props = $props();

  let showFreshConfirm = $state(false);
  let recoveryCode = $state("");
  let isWorking = $state(false);
  let errorMsg = $state("");

  /** Run one alternative route and surface a rejection in the dialog instead of an unhandled promise. */
  async function runRoute(action: (() => Promise<void>) | undefined, fallbackMsg: string) {
    if (!action) {
      return;
    }
    errorMsg = "";
    isWorking = true;
    try {
      await action();
    } catch (err: unknown) {
      // "No passkey copy stored" is actionable, unlike "ceremony failed".
      errorMsg =
        err instanceof EnvelopeFactorMissingError
          ? $t("security.unlock.passkeyHasNoCopy")
          : fallbackMsg;
    } finally {
      isWorking = false;
    }
  }

  async function submit() {
    if (!recoveryCode.trim() || isWorking) {
      return;
    }
    isWorking = true;
    errorMsg = "";
    try {
      await onSubmit(recoveryCode);
    } catch {
      // Every failure reads the same: this code does not open this account.
      errorMsg = $t("security.unlock.wrong");
    } finally {
      isWorking = false;
    }
  }
</script>

<Modal
  open={true}
  size="medium"
  title={$t("security.unlock.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <form
    class="flex flex-col gap-4"
    onsubmit={(e) => { e.preventDefault(); submit(); }}
  >
    <p class="text-sm text-muted">{$t("security.unlock.intro")}</p>

    <Field label={$t("security.unlock.label")} error={errorMsg}>
      <TextInput
        bind:value={recoveryCode}
        placeholder={$t("security.unlock.placeholder")}
        class="font-mono tracking-wider"
      />
    </Field>

    {#if onPasskey}
      <div class="border-t border-line pt-4">
        <p class="m-0 mb-2 text-sm text-muted">{$t("security.unlock.passkeyIntro")}</p>
        <Button
          severity="secondary"
          disabled={isWorking}
          onClick={() => runRoute(onPasskey, $t("security.unlock.passkeyFailed"))}
        >
          {$t("security.unlock.usePasskey")}
        </Button>
      </div>
    {/if}

    {#if onStartFresh}
      <div class="border-t border-line pt-4">
        {#if showFreshConfirm}
          <p class="m-0 mb-2 text-sm text-content" role="alert">
            {$t("security.unlock.startFreshWarning")}
          </p>
          <Button
            severity="danger"
            disabled={isWorking}
            onClick={() => runRoute(onStartFresh, $t("security.unlock.startFreshFailed"))}
          >
            {$t("security.unlock.startFreshConfirm")}
          </Button>
        {:else}
          <Button variant="text" size="sm" onClick={() => (showFreshConfirm = true)}>
            {$t("security.unlock.skip")}
          </Button>
        {/if}
      </div>
    {/if}
  </form>

  {#snippet footer()}

      <Button disabled={isWorking || !recoveryCode.trim()} loading={isWorking} onClick={submit}>
        {isWorking ? $t("security.unlock.working") : $t("security.unlock.submit")}
      </Button>

  {/snippet}
</Modal>
