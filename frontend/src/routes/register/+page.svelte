<script lang="ts">
  // Self-registration, step one (issue #53): ask for a verification link. The server answers the same whether or not the address already has an account, so this page cannot say which it was either.
  import { apiErrorMessage, ApiError } from "#lib/api/client";
  import { requestRegistration } from "#lib/api/registration";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Field, TextInput } from "#lib/components/ui";
  import AuthCard from "#lib/components/unlock/AuthCard.svelte";

  let email = $state("");
  let isSubmitting = $state(false);
  let errorMsg = $state("");
  let sent = $state(false);
  let sentTo = $state("");

  async function handleRegister() {
    errorMsg = "";
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      errorMsg = translate("auth.register.errors.enterEmail");
      return;
    }
    isSubmitting = true;
    try {
      await requestRegistration(normalizedEmail);
      sentTo = normalizedEmail;
      sent = true;
    } catch (err: unknown) {
      // The rate limiter's 429 carries no code of its own.
      errorMsg =
        err instanceof ApiError && err.status === 429
          ? translate("auth.register.errors.tooMany")
          : apiErrorMessage(err, translate("auth.register.errors.failed"));
    } finally {
      isSubmitting = false;
    }
  }
</script>

<AuthCard title={$t("auth.register.title")} subtitle={$t("auth.register.subtitle")}>

  {#if sent}
    <!-- Neutral wording (no account-existence oracle), but explicit about the mail and the approval (issue #122). -->
    <Alert severity="success" title={$t("auth.register.sentTitle")} class="mb-4">{$t("auth.register.sent")}</Alert>
    <p class="m-0 mb-2 text-sm font-semibold text-content">{$t("auth.register.nextSteps")}</p>
    <ol class="m-0 mb-4 flex flex-col gap-2 pl-5 text-sm text-content">
      <li>{$t("auth.register.step1", { email: sentTo })}</li>
      <li>{$t("auth.register.step2")}</li>
      <li>{$t("auth.register.step3")}</li>
    </ol>
    <p class="m-0 mb-2 text-sm text-muted">{$t("auth.register.sentHint")}</p>
  {:else}
    {#if errorMsg}
      <Alert severity="danger" class="mb-5">{errorMsg}</Alert>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleRegister(); }} class="flex flex-col gap-5">
      <Field forId="email" label={$t("auth.register.emailLabel")} hint={$t("auth.register.emailHint")}>
        {#snippet children({ id })}
          <TextInput
            {id}
            type="email"
            bind:value={email}
            placeholder={$t("auth.register.emailPlaceholder")}
            autocomplete="email"
            required
            disabled={isSubmitting}
          />
        {/snippet}
      </Field>

      <Button type="submit" block loading={isSubmitting}>
        {isSubmitting ? $t("auth.register.sending") : $t("auth.register.submit")}
      </Button>
    </form>
  {/if}

  <div class="mt-6 text-center">
    <a href="/unlock" class="text-sm text-accent no-underline hover:underline">{$t("auth.register.backToSignIn")}</a>
    <span class="mx-2 text-sm text-subtle" aria-hidden="true">·</span>
    <a href="/about" class="text-sm text-accent no-underline hover:underline">{$t("about.headerLink")}</a>
  </div>
</AuthCard>
