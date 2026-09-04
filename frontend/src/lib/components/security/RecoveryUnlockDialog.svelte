<script lang="ts">
  /**
   * Recovers the data key with the printable recovery code.
   *
   * Reached when the account's password wrap is unusable — which is what a
   * server-side password write (a reset, an admin action, the CLI) leaves
   * behind, because the server cannot re-wrap a key it has never seen. Getting
   * through this dialog is the difference between a reset that keeps the
   * teacher's exams and one that leaves them staring at blank fields.
   */
  import { Button, Field, Modal, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  export let onSubmit: (recoveryCode: string) => Promise<void>;
  /**
   * Start over with a new data key. Irreversible, so it is confirmed in two
   * steps rather than offered as a button next to the code field.
   */
  export let onStartFresh: (() => Promise<void>) | undefined = undefined;
  /**
   * Open the vault with a PRF passkey instead.
   *
   * A reset invalidates only the *password* wrap — a passkey's still holds the
   * same key, so for anyone who has one this recovers everything and the
   * destructive route below is never needed.
   */
  export let onPasskey: (() => Promise<void>) | undefined = undefined;

  let showFreshConfirm = false;

  let recoveryCode = "";
  let isWorking = false;
  let errorMsg = "";

  async function submit() {
    if (!recoveryCode.trim() || isWorking) {
      return;
    }
    isWorking = true;
    errorMsg = "";
    try {
      await onSubmit(recoveryCode);
    } catch {
      // Any failure here is the same failure from the teacher's point of view:
      // this code does not open this account.
      errorMsg = $t("security.unlock.wrong");
    } finally {
      isWorking = false;
    }
  }
</script>

<Modal
  open={true}
  size="md"
  title={$t("security.unlock.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <form
    class="flex flex-col gap-4"
    on:submit|preventDefault={submit}
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
        <Button variant="secondary" disabled={isWorking} onClick={onPasskey}>
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
          <Button variant="danger" disabled={isWorking} onClick={onStartFresh}>
            {$t("security.unlock.startFreshConfirm")}
          </Button>
        {:else}
          <button
            type="button"
            class="cursor-pointer border-none bg-transparent p-0 text-sm text-accent underline"
            on:click={() => (showFreshConfirm = true)}
          >
            {$t("security.unlock.skip")}
          </button>
        {/if}
      </div>
    {/if}
  </form>

  <svelte:fragment slot="footer">
    <Button disabled={isWorking || !recoveryCode.trim()} loading={isWorking} onClick={submit}>
      {isWorking ? $t("security.unlock.working") : $t("security.unlock.submit")}
    </Button>
  </svelte:fragment>
</Modal>
