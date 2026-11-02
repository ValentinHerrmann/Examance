<script lang="ts">
  import { t } from "#lib/i18n";
  import { faBookOpen, faKey, faLightbulb, faUserPlus } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Button, Card, Field, TextInput } from "#lib/components/ui";
  import OldAddressPasskey from "./OldAddressPasskey.svelte";
  import { showsOldAddressPasskey } from "#lib/domainMove";

  interface Props {
    email: string;
    password: string;
    errorMsg: string;
    /** A neutral notice, e.g. that the account still waits for an admin's approval. */
    infoMsg?: string;
    isLoading: boolean;
    onUnlock: () => void;
    /** Passkey sign-in (no email, no second factor), or undefined without WebAuthn. */
    onPasskey?: (() => void) | undefined;
    /** Passkey of the old address during a domain move (issue #198); shown only on the new address. */
    onLegacyPasskey?: (() => void) | undefined;
  }

  let {
    email = $bindable(),
    password = $bindable(),
    errorMsg,
    infoMsg = "",
    isLoading,
    onUnlock,
    onPasskey,
    onLegacyPasskey,
  }: Props = $props();
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
        <!-- During a domain move the old-passkey line takes the hint's place, so the page does not grow and scroll. -->
        {#if onLegacyPasskey && showsOldAddressPasskey()}
          <OldAddressPasskey onClick={onLegacyPasskey} disabled={isLoading} />
        {:else}
          <p class="m-0 text-center text-xs text-muted">{$t("auth.unlock.cloud.passkeyHint")}</p>
        {/if}
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
<div class="mx-auto mt-4 flex w-full max-w-form flex-col items-center gap-2">
  <p class="m-0 text-base font-medium text-content">{$t("auth.unlock.cloud.newHere")}</p>
  <div class="flex flex-wrap justify-center gap-2">
    <Button href="/help" variant="outlined" severity="secondary" icon={faBookOpen}>
      {$t("help.ui.unlockLink")}
    </Button>
    <Button href="/about" variant="outlined" severity="secondary" icon={faLightbulb}>
      {$t("about.headerLink")}
    </Button>
  </div>
</div>
