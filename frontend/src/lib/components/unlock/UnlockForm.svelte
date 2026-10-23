<script lang="ts">
  import { untrack } from "svelte";
  import BackendUrlInput from "#lib/components/common/BackendUrlInput.svelte";
  import { t } from "#lib/i18n";
  import { stripBackendProtocol } from "#lib/stores/backendStore";
  import { faKey, faUserPlus } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Button, Card, Field, TextInput } from "#lib/components/ui";

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

  // A remembered server is shown as one line so the page fits on one screen (issue #128).
  let editServer = $state(untrack(() => !backendUrl.trim()));
</script>

<div class="mb-3 text-center">
  <img src="/favicon.png" alt="Examance logo" class="mx-auto mb-2 size-10 rounded-xl object-contain" />
  <h1 class="m-0 text-2xl font-normal text-content">{$t("auth.unlock.title")}</h1>
  <p class="mt-1 mb-0 text-sm text-muted">{$t("auth.unlock.subtitle")}</p>
</div>

{#if errorMsg}
  <Alert severity="danger" class="mx-auto mb-3 w-full max-w-form">{errorMsg}</Alert>
{/if}
{#if infoMsg}
  <Alert severity="info" class="mx-auto mb-3 w-full max-w-form">{infoMsg}</Alert>
{/if}

<div class="mx-auto w-full max-w-form">
  <Card padded={false} class="flex flex-col p-5 sm:p-6">
    <form onsubmit={(e) => { e.preventDefault(); onUnlock(); }} class="flex flex-col gap-3">
      {#if editServer}
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
      {:else}
        <p class="m-0 flex min-w-0 items-center gap-2 text-sm text-muted">
          <span class="shrink-0">{$t("auth.unlock.cloud.serverSummary")}</span>
          <span class="min-w-0 truncate font-mono text-content">{stripBackendProtocol(backendUrl)}</span>
          <button
            type="button"
            class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent hover:underline pointer-coarse:min-h-11"
            onclick={() => (editServer = true)}
          >
            {$t("auth.unlock.cloud.changeServer")}
          </button>
        </p>
      {/if}

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

    </form>

    <!-- Registration is a first-class action, not a footnote (issue #128). -->
    <div class="mt-4 flex flex-col gap-2 border-t border-line pt-4">
      <p class="m-0 text-center text-sm text-muted">{$t("auth.unlock.cloud.noAccount")}</p>
      <Button href="/register" variant="outlined" severity="primary" block icon={faUserPlus}>
        {$t("auth.unlock.cloud.register")}
      </Button>
    </div>
  </Card>
</div>

<!-- /help and /about are public paths, so both work while signed out. -->
<p class="mx-auto mt-3 mb-0 flex w-full max-w-form flex-wrap justify-center gap-x-2 gap-y-1 text-sm text-muted">
  <span>{$t("auth.unlock.cloud.newHere")}</span>
  <a href="/help" class="text-accent no-underline hover:underline">{$t("help.ui.unlockLink")}</a>
  <span aria-hidden="true">·</span>
  <a href="/about" class="text-accent no-underline hover:underline">{$t("about.headerLink")}</a>
</p>
