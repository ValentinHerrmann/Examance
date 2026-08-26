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
  export let onSkip: (() => void) | undefined = undefined;

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

    {#if onSkip}
      <p class="text-sm text-muted">{$t("security.unlock.skipWarning")}</p>
    {/if}
  </form>

  <svelte:fragment slot="footer">
    {#if onSkip}
      <Button variant="ghost" disabled={isWorking} onClick={onSkip}>
        {$t("security.unlock.skip")}
      </Button>
    {/if}
    <Button disabled={isWorking || !recoveryCode.trim()} loading={isWorking} onClick={submit}>
      {isWorking ? $t("security.unlock.working") : $t("security.unlock.submit")}
    </Button>
  </svelte:fragment>
</Modal>
