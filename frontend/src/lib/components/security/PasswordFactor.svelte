<script lang="ts">
  /**
   * The password, presented as a factor rather than as the start of a sign-in.
   *
   * No email field: the account is the one the pending token names. Asking for
   * an address here would make the second step a probe for which addresses have
   * accounts, which is exactly what keeping the account in the token avoids.
   */
  import { Button, Field, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";

  export let onSubmit: (password: string) => Promise<void>;
  export let errorMsg = "";

  let password = "";
  let isWorking = false;

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

<form class="flex w-full flex-col gap-4" on:submit|preventDefault={submit}>
  <div>
    <h2 class="m-0 text-lg font-semibold text-accent">
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
