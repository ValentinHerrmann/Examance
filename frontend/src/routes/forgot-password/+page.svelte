<script lang="ts">
  import { api, ApiError } from "$lib/api/client";
  import { t, translate } from "$lib/i18n";
  import { Alert, Button, Card, Field, PageShell, TextInput } from "$lib/components/ui";

  let email = "";
  let isSubmitting = false;
  let errorMsg = "";
  let successMsg = "";

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
      if (err instanceof ApiError) {
        errorMsg = err.message;
      } else {
        errorMsg = translate("auth.forgotPassword.errors.failed");
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<PageShell width="form" center>
  <Card class="sm:p-8">
    <div class="mb-6 text-center">
      <img src="/favicon.png" alt="Examance logo" class="mx-auto mb-3 size-14 rounded-xl object-contain" />
      <h1 class="m-0 text-2xl font-normal text-content">{$t("auth.forgotPassword.title")}</h1>
      <p class="mt-2 mb-0 text-sm leading-snug text-muted">{$t("auth.forgotPassword.subtitle")}</p>
    </div>

    {#if successMsg}
      <Alert severity="success" class="mb-5">{successMsg}</Alert>
    {/if}
    {#if errorMsg}
      <Alert severity="danger" class="mb-5">{errorMsg}</Alert>
    {/if}

    <form on:submit|preventDefault={handleForgotPassword} class="flex flex-col gap-5">
      <Field forId="email" label={$t("auth.forgotPassword.emailLabel")} let:id>
        <TextInput
          {id}
          type="email"
          bind:value={email}
          placeholder={$t("auth.forgotPassword.emailPlaceholder")}
          required
          disabled={isSubmitting}
        />
      </Field>

      <Button type="submit" block disabled={isSubmitting}>
        {isSubmitting ? $t("auth.forgotPassword.sending") : $t("auth.forgotPassword.sendLink")}
      </Button>
    </form>

    <div class="mt-6 text-center">
      <a href="/unlock" class="text-sm text-accent no-underline hover:underline">{$t("auth.forgotPassword.backToUnlock")}</a>
    </div>
  </Card>
</PageShell>
