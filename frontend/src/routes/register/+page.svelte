<script lang="ts">
  // Self-registration, step one (issue #53): ask for a verification link. The server answers the same
  // whether or not the address already has an account, so this page cannot say which it was either.
  import { get } from "svelte/store";
  import { apiErrorMessage, ApiError } from "#lib/api/client";
  import { requestRegistration } from "#lib/api/registration";
  import { t, translate } from "#lib/i18n";
  import { backendStore } from "#lib/stores/backendStore";
  import BackendUrlInput from "#lib/components/common/BackendUrlInput.svelte";
  import { Alert, Button, Field, TextInput } from "#lib/components/ui";
  import AuthCard from "#lib/components/unlock/AuthCard.svelte";

  let backendUrl = $state(get(backendStore));
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
    const trimmedBackendUrl = backendUrl.trim();
    if (!trimmedBackendUrl) {
      errorMsg = translate("auth.unlock.errors.enterServerAddress");
      return;
    }
    try {
      backendStore.setTransient(trimmedBackendUrl);
    } catch (err: any) {
      errorMsg = err?.message ?? translate("auth.unlock.errors.invalidBackendUrl");
      return;
    }

    isSubmitting = true;
    try {
      await requestRegistration(normalizedEmail);
      backendStore.saveSuccessfulBackendUrl(trimmedBackendUrl);
      sentTo = normalizedEmail;
      sent = true;
    } catch (err: unknown) {
      backendStore.restoreSavedUrl();
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
      <Field forId="backendUrl" label={$t("auth.unlock.cloud.backendUrl")}>
        {#snippet children({ id })}
          <BackendUrlInput
            {id}
            bind:value={backendUrl}
            placeholder={$t("auth.unlock.cloud.backendUrlPlaceholder")}
            required
            disabled={isSubmitting}
          />
        {/snippet}
      </Field>

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
