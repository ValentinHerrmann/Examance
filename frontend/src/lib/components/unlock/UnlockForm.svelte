<script lang="ts">
  import BackendUrlInput from "#lib/components/common/BackendUrlInput.svelte";
  import { t } from "#lib/i18n";
  import {
    faArrowRight,
    faCircleQuestion,
    faCloud,
    faKey,
  } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Badge, Button, Card, Field, Icon, TextInput } from "#lib/components/ui";

  interface Props {
    backendUrl: string;
    email: string;
    password: string;
    errorMsg: string;
    /** A neutral notice, e.g. that the account still waits for an admin's approval. */
    infoMsg?: string;
    isLoading: boolean;
    onUnlock: () => void;
    /** Passkey sign-in (no email, no second factor), or undefined without WebAuthn. */
    onPasskey?: (() => void) | undefined;
  }

  let {
    backendUrl = $bindable(),
    email = $bindable(),
    password = $bindable(),
    errorMsg,
    infoMsg = "",
    isLoading,
    onUnlock,
    onPasskey,
  }: Props = $props();
</script>

<div class="mb-4 text-center sm:mb-5">
  <img src="/favicon.png" alt="Examance logo" class="mx-auto mb-2 size-12 rounded-xl object-contain" />
  <h1 class="m-0 text-2xl font-normal text-content">{$t("auth.unlock.title")}</h1>
  <p class="mt-2 mb-0 text-base text-muted">{$t("auth.unlock.subtitle")}</p>
  <!-- The very first screen someone sees, and the one place where no workspace
       exists yet to explain itself. /help is a public path, so this works while
       locked. -->
  <Button
    href="/help"
    variant="outlined"
    severity="primary"
    size="sm"
    icon={faCircleQuestion}
    iconRight={faArrowRight}
    class="mt-3"
  >
    {$t("help.ui.unlockLink")}
  </Button>
</div>

{#if errorMsg}
  <Alert severity="danger" class="mb-5">{errorMsg}</Alert>
{/if}
{#if infoMsg}
  <Alert severity="info" class="mb-5">{infoMsg}</Alert>
{/if}

<div class="mx-auto w-full max-w-form">
  <Card padded={false} class="relative flex flex-col p-5 sm:p-6">
    <Badge severity="info" class="absolute top-3 right-3 sm:top-5 sm:right-5">
      {$t("auth.unlock.cloud.schoolAccount")}
    </Badge>
    <div class="mb-2 flex items-center gap-3 pr-24">
      <Icon icon={faCloud} class="shrink-0 text-3xl text-info-fg" />
      <h2 class="m-0 text-xl font-medium text-content">{$t("auth.unlock.cloud.connectToServer")}</h2>
    </div>
    <p class="m-0 mb-3 text-sm leading-snug text-muted">
      {$t("auth.unlock.cloud.description")}
    </p>

    <form onsubmit={(e) => { e.preventDefault(); onUnlock(); }} class="flex flex-col gap-3">
      <Field forId="backendUrl" label={$t("auth.unlock.cloud.backendUrl")}>
        {#snippet children({ id })}
          <BackendUrlInput
            {id}
            bind:value={backendUrl}
            placeholder={$t("auth.unlock.cloud.backendUrlPlaceholder")}
            required
          />
        {/snippet}
      </Field>

      <Field forId="email" label={$t("auth.unlock.cloud.email")}>
        {#snippet children({ id })}
          <TextInput
            {id}
            type="email"
            bind:value={email}
            placeholder={$t("auth.unlock.cloud.emailPlaceholder")}
            required
          />
        {/snippet}
      </Field>

      <div class="flex min-w-0 flex-col gap-1.5">
        <Field forId="password" label={$t("auth.unlock.cloud.password")}>
          {#snippet children({ id })}
            <TextInput
              {id}
              type="password"
              bind:value={password}
              placeholder={$t("auth.unlock.cloud.passwordPlaceholder")}
              required
            />
          {/snippet}
        </Field>
        <div class="text-right">
          <a href="/forgot-password" class="text-sm text-accent no-underline hover:underline">
            {$t("auth.unlock.cloud.forgotPassword")}
          </a>
        </div>
      </div>

      <Button type="submit" block loading={isLoading}>
        {isLoading ? $t("auth.unlock.cloud.authenticating") : $t("auth.unlock.cloud.connectAndSignIn")}
      </Button>

      {#if onPasskey}
        <div class="flex w-full items-center gap-3 text-xs text-muted" aria-hidden="true">
          <span class="h-px min-w-0 flex-1 bg-line"></span>
          {$t("auth.unlock.cloud.or")}
          <span class="h-px min-w-0 flex-1 bg-line"></span>
        </div>
        <Button variant="outlined" severity="secondary" block icon={faKey} disabled={isLoading} onClick={onPasskey}>
          {$t("security.passkey.signIn")}
        </Button>
        <p class="m-0 text-center text-xs text-muted">{$t("auth.unlock.cloud.passkeyHint")}</p>
      {/if}

      <p class="m-0 text-center text-sm text-muted">
        {$t("auth.unlock.cloud.noAccount")}
        <a href="/register" class="text-accent no-underline hover:underline">{$t("auth.unlock.cloud.register")}</a>
      </p>
    </form>
  </Card>
</div>
