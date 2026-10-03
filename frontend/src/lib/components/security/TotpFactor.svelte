<script lang="ts">
  /** Second sign-in factor: an authenticator code, or a backup code standing in for it (the same factor, not a third). */
  import { Button, Field, TextInput } from "#lib/components/ui";
  import { t } from "#lib/i18n";

  interface Props {
    onSubmit: (code: string, useBackupCode: boolean) => Promise<void>;
    errorMsg?: string;
  }

  let { onSubmit, errorMsg = "" }: Props = $props();

  let code = $state("");
  let useBackupCode = $state(false);
  let isWorking = $state(false);

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

<form class="flex w-full flex-col gap-4" onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <div>
    <h2 class="m-0 text-xl font-medium text-content">
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
      class="font-mono text-lg tracking-widest"
    />
  </Field>

  <Button type="submit" block disabled={isWorking || !code.trim()} loading={isWorking}>
    {isWorking ? $t("security.factors.checking") : $t("security.factors.submit")}
  </Button>

  <Button variant="text" size="sm" onClick={toggleMode}>
    {useBackupCode ? $t("security.factors.useTotp") : $t("security.factors.useBackupCode")}
  </Button>
</form>
