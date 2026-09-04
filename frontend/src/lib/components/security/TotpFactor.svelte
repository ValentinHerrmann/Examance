<script lang="ts">
  /**
   * The second sign-in factor: a code from the authenticator app, or a backup
   * code standing in for it.
   *
   * A backup code counts as the *same* factor rather than a third one — it
   * replaces the authenticator, it does not add to it.
   */
  import { Button, Field, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  export let onSubmit: (code: string, useBackupCode: boolean) => Promise<void>;
  export let errorMsg = "";

  let code = "";
  let useBackupCode = false;
  let isWorking = false;

  async function submit() {
    if (!code.trim() || isWorking) {
      return;
    }
    isWorking = true;
    try {
      await onSubmit(code.trim(), useBackupCode);
    } finally {
      isWorking = false;
    }
  }

  function toggleMode() {
    useBackupCode = !useBackupCode;
    code = "";
    errorMsg = "";
  }
</script>

<form class="flex w-full flex-col gap-4" on:submit|preventDefault={submit}>
  <div>
    <h2 class="m-0 text-lg font-semibold text-accent">
      {useBackupCode ? $t("security.factors.backupTitle") : $t("security.factors.totpTitle")}
    </h2>
    <p class="mt-1 text-sm text-muted">
      {useBackupCode ? $t("security.factors.backupIntro") : $t("security.factors.totpIntro")}
    </p>
  </div>

  <Field
    label={useBackupCode
      ? $t("security.factors.backupLabel")
      : $t("security.factors.totpLabel")}
    error={errorMsg}
  >
    <TextInput
      bind:value={code}
      placeholder={useBackupCode ? "XXXXX-XXXXX" : "000000"}
      class="font-mono text-lg tracking-[0.3em]"
    />
  </Field>

  <Button type="submit" block disabled={isWorking || !code.trim()} loading={isWorking}>
    {isWorking ? $t("security.factors.checking") : $t("security.factors.submit")}
  </Button>

  <button
    type="button"
    class="cursor-pointer border-none bg-transparent p-0 text-sm text-accent underline"
    on:click={toggleMode}
  >
    {useBackupCode ? $t("security.factors.useTotp") : $t("security.factors.useBackupCode")}
  </button>
</form>
