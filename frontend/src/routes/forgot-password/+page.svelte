<script lang="ts">
  import { api, apiErrorMessage } from "#lib/api/client";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Field, TextInput } from "#lib/components/ui";
  import AuthCard from "#lib/components/unlock/AuthCard.svelte";

  let email = $state("");
  let isSubmitting = $state(false);
  let errorMsg = $state("");
  let successMsg = $state("");

  async function handleForgotPassword() {
    errorMsg = "";
    successMsg = "";

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      errorMsg = translate("auth.forgotPassword.errors.enterEmail");
      return;
    }

    isSubmitting = true;
    try {
      const res = await api.post<{ message: string }>(
        "/auth/forgot-password",
        { email: normalizedEmail },
        { silentError: true }
      );
      successMsg = res.message || translate("auth.forgotPassword.defaultSuccess");
      email = "";
    } catch (err: unknown) {
      errorMsg = apiErrorMessage(err, translate("auth.forgotPassword.errors.failed"));
    } finally {
      isSubmitting = false;
    }
  }
</script>

<AuthCard title={$t("auth.forgotPassword.title")} subtitle={$t("auth.forgotPassword.subtitle")}>

  {#if successMsg}
    <Alert severity="success" class="mb-5">{successMsg}</Alert>
  {/if}
  {#if errorMsg}
    <Alert severity="danger" class="mb-5">{errorMsg}</Alert>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); handleForgotPassword(); }} class="flex flex-col gap-5">
    <Field forId="email" label={$t("auth.forgotPassword.emailLabel")}>
      {#snippet children({ id })}
        <TextInput
          {id}
          type="email"
          bind:value={email}
          placeholder={$t("auth.forgotPassword.emailPlaceholder")}
          required
          disabled={isSubmitting}
        />
      {/snippet}
    </Field>

    <Button type="submit" block disabled={isSubmitting}>
      {isSubmitting ? $t("auth.forgotPassword.sending") : $t("auth.forgotPassword.sendLink")}
    </Button>
  </form>

  <div class="mt-6 text-center">
    <a href="/unlock" class="text-sm text-accent no-underline hover:underline">{$t("auth.forgotPassword.backToUnlock")}</a>
  </div>
</AuthCard>
