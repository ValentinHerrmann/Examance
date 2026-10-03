<script lang="ts">
  /** The password as a second factor. No email field: the account is named by the pending token, so this step cannot probe which addresses have accounts. */
  import { Button, Field, TextInput } from "#lib/components/ui";
  import { t } from "#lib/i18n";

  interface Props {
    onSubmit: (password: string) => Promise<void>;
    errorMsg?: string;
  }

  let { onSubmit, errorMsg = "" }: Props = $props();

  let password = $state("");
  let isWorking = $state(false);

  async function submit() {
    if (!password || isWorking) {
      return;
    }
    isWorking = true;
    try {
      await onSubmit(password);
    } finally {
      isWorking = false;
    }
  }
</script>

<form class="flex w-full flex-col gap-4" onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <div>
    <h2 class="m-0 text-xl font-medium text-content">
      {$t("security.factors.passwordTitle")}
    </h2>
    <p class="mt-1 text-sm text-muted">{$t("security.factors.passwordIntro")}</p>
  </div>

  <Field label={$t("security.panel.factorPassword")} error={errorMsg}>
    <TextInput type="password" bind:value={password} />
  </Field>

  <Button type="submit" block disabled={isWorking || !password} loading={isWorking}>
    {isWorking ? $t("security.factors.checking") : $t("security.factors.submit")}
  </Button>
</form>
