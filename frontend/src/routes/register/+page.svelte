<script lang="ts">
  // Self-registration, step one (issue #53): ask for a verification link. The server answers the same
  // whether or not the address already has an account, so this page cannot say which it was either.
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { ApiError } from "#lib/api/client";
  import { registrationEnabled, requestRegistration } from "#lib/api/registration";
  import { t, translate } from "#lib/i18n";
  import { backendStore } from "#lib/stores/backendStore";
  import BackendUrlInput from "#lib/components/common/BackendUrlInput.svelte";
  import { Alert, Button, Card, Field, PageShell, TextInput } from "#lib/components/ui";

  let backendUrl = $state(get(backendStore));
  let email = $state("");
  let isSubmitting = $state(false);
  let errorMsg = $state("");
  let sent = $state(false);
  /** Null while unknown (not checked yet, or the server was unreachable): the form stays usable. */
  let enabled = $state<boolean | null>(null);

  onMount(async () => {
    try {
      enabled = await registrationEnabled();
    } catch {
      enabled = null;
    }
  });

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
      sent = true;
    } catch (err: unknown) {
      backendStore.restoreSavedUrl();
      if (err instanceof ApiError && err.code === "ERR_REGISTRATION_DISABLED") {
        enabled = false;
      } else if (err instanceof ApiError && err.status === 429) {
        // The rate limiter's 429 carries no code of its own.
        errorMsg = translate("auth.register.errors.tooMany");
      } else if (err instanceof ApiError) {
        errorMsg = err.message;
      } else {
        errorMsg = translate("auth.register.errors.failed");
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
      <h1 class="m-0 text-2xl font-normal text-content">{$t("auth.register.title")}</h1>
      <p class="mt-2 mb-0 text-sm leading-snug text-muted">{$t("auth.register.subtitle")}</p>
    </div>

    {#if enabled === false}
      <Alert severity="info" class="mb-5">{$t("auth.register.disabled")}</Alert>
    {:else if sent}
      <Alert severity="success" class="mb-3">{$t("auth.register.sent")}</Alert>
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
    </div>
  </Card>
</PageShell>
