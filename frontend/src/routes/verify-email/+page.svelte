<script lang="ts">
  // Self-registration, step two (issue #53): the mailed link proves the address; here the registrant
  // chooses a password and the account is created. It is approved on the spot when its domain is on the
  // admin's always-allowed list, and otherwise waits for an admin. No session is created either way.
  import { onMount } from "svelte";
  import { apiErrorMessage, ApiError } from "#lib/api/client";
  import { takeUrlToken } from "#lib/utils/urlToken";
  import { completeRegistration } from "#lib/api/registration";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Field, TextInput, Textarea } from "#lib/components/ui";
  import AuthCard from "#lib/components/unlock/AuthCard.svelte";

  const NOTE_MAX = 500;

  let token = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let note = $state("");
  let isSubmitting = $state(false);
  let errorMsg = $state("");
  let tokenInvalid = $state(false);
  let outcome = $state<"approved" | "pending" | null>(null);

  onMount(() => {
    token = takeUrlToken();
    if (!token) {
      tokenInvalid = true;
      errorMsg = translate("auth.verifyEmail.errors.tokenMissing");
    }
  });

  async function handleComplete() {
    errorMsg = "";
    if (newPassword.length < 12) {
      errorMsg = translate("auth.resetPassword.errors.passwordTooShort");
      return;
    }
    if (newPassword !== confirmPassword) {
      errorMsg = translate("auth.resetPassword.errors.passwordsDoNotMatch");
      return;
    }

    isSubmitting = true;
    try {
      outcome = await completeRegistration(token, newPassword, note.slice(0, NOTE_MAX));
      newPassword = "";
      confirmPassword = "";
      note = "";
    } catch (err: unknown) {
      tokenInvalid = err instanceof ApiError && err.code === "ERR_INVALID_REGISTRATION_TOKEN";
      errorMsg =
        err instanceof ApiError && err.status === 429
          ? translate("auth.register.errors.tooMany")
          : apiErrorMessage(err, translate("auth.verifyEmail.errors.failed"));
    } finally {
      isSubmitting = false;
    }
  }
</script>

<AuthCard title={$t("auth.verifyEmail.title")} subtitle={$t("auth.verifyEmail.subtitle")}>

  {#if outcome === "approved"}
    <Alert severity="success" class="mb-5">{$t("auth.verifyEmail.approved")}</Alert>
    <div class="text-center">
      <Button href="/unlock">{$t("auth.verifyEmail.signIn")}</Button>
    </div>
  {:else if outcome === "pending"}
    <Alert severity="info" class="mb-3">{$t("auth.verifyEmail.pending")}</Alert>
    <p class="m-0 text-sm text-muted">{$t("auth.verifyEmail.pendingHint")}</p>
  {:else}
    {#if errorMsg}
      <Alert severity="danger" class="mb-5">{errorMsg}</Alert>
    {/if}

    {#if tokenInvalid}
      <div class="text-center">
        <Button href="/register" variant="outlined">{$t("auth.verifyEmail.registerAgain")}</Button>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); handleComplete(); }} class="flex flex-col gap-5">
        <Field forId="newPassword" label={$t("auth.resetPassword.newPasswordLabel")}>
          {#snippet children({ id })}
            <TextInput
              {id}
              type="password"
              bind:value={newPassword}
              placeholder={$t("auth.resetPassword.newPasswordPlaceholder")}
              autocomplete="new-password"
              minlength={12}
              required
              disabled={isSubmitting}
            />
          {/snippet}
        </Field>

        <Field forId="confirmPassword" label={$t("auth.resetPassword.confirmPasswordLabel")}>
          {#snippet children({ id })}
            <TextInput
              {id}
              type="password"
              bind:value={confirmPassword}
              placeholder={$t("auth.resetPassword.confirmPasswordPlaceholder")}
              autocomplete="new-password"
              minlength={12}
              required
              disabled={isSubmitting}
            />
          {/snippet}
        </Field>

        <Field forId="note" label={$t("auth.verifyEmail.noteLabel")} hint={$t("auth.verifyEmail.noteHint")}>
          {#snippet children({ id })}
            <Textarea
              {id}
              bind:value={note}
              rows={3}
              maxlength={NOTE_MAX}
              placeholder={$t("auth.verifyEmail.notePlaceholder")}
              disabled={isSubmitting}
            />
          {/snippet}
        </Field>

        <Button type="submit" block loading={isSubmitting}>
          {isSubmitting ? $t("auth.verifyEmail.working") : $t("auth.verifyEmail.submit")}
        </Button>
      </form>
    {/if}
  {/if}

  <div class="mt-6 text-center">
    <a href="/unlock" class="text-sm text-accent no-underline hover:underline">{$t("auth.register.backToSignIn")}</a>
  </div>
</AuthCard>
