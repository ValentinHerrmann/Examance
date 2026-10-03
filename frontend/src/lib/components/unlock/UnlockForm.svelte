<script lang="ts">
  import BackendUrlInput from "#lib/components/common/BackendUrlInput.svelte";
  import { t } from "#lib/i18n";
  import {
    faArrowRight,
    faCircleQuestion,
    faCloud,
    faKey,
    faShieldHalved,
  } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Badge, Button, Card, Field, Icon, TextInput } from "#lib/components/ui";
  import type { WorkspaceSummary } from "#lib/db/workspace";
  import { getStoragePolicyBadge } from "#lib/stores/storagePolicy";
  import { extractHostname } from "#lib/stores/backendStore";

  interface Props {
    backendUrl: string;
    email: string;
    password: string;
    errorMsg: string;
    isLoading: boolean;
    onUnlock: () => void;
    onUnlockLocal: () => void;
    /** Passkey sign-in (no email, no second factor), or undefined without WebAuthn. */
    onPasskey?: (() => void) | undefined;
    localPassphrase: string;
    localPassphraseConfirm: string;
    /** First use on this device, or a legacy vault being migrated — confirm the passphrase. */
    isNewLocalVault: boolean;
    /** A vault created before the passphrase change; unlocking re-encrypts it. */
    needsLegacyMigration: boolean;
    /** This browser's workspace (null while loading): which door opens it, and whose it is. */
    workspace: WorkspaceSummary | null;
  }

  let {
    backendUrl = $bindable(),
    email = $bindable(),
    password = $bindable(),
    errorMsg,
    isLoading,
    onUnlock,
    onUnlockLocal,
    onPasskey,
    localPassphrase = $bindable(),
    localPassphraseConfirm = $bindable(),
    isNewLocalVault,
    needsLegacyMigration,
    workspace,
  }: Props = $props();

  // A workspace never bound to a key belongs to the door its mode implies.
  let opensWithPassphrase = $derived(
    !!workspace &&
      (workspace.ownerKind === "local-vault" || (workspace.ownerKind === null && workspace.mode === "all-local")),
  );
  let opensWithAccount = $derived(
    !!workspace &&
      (workspace.ownerKind === "account" || (workspace.ownerKind === null && workspace.mode !== "all-local")),
  );
  let isEmpty = $derived(!workspace || (!workspace.hasData && workspace.ownerKind === null));
  let modeLabel = $derived(
    workspace ? getStoragePolicyBadge({ storageMode: workspace.mode, latexCompilation: "local" }).text : "",
  );
  let ownerLabel = $derived(
    workspace?.accountEmail
      ? workspace.backendOrigin
        ? `${workspace.accountEmail} (${extractHostname(workspace.backendOrigin)})`
        : workspace.accountEmail
      : workspace?.backendOrigin
        ? extractHostname(workspace.backendOrigin)
        : "?",
  );
  // Where a door cannot open what this browser holds, say so before anyone types a secret.
  let localDoorHint = $derived(!isEmpty && opensWithAccount);
  let accountDoorHint = $derived(!isEmpty && opensWithPassphrase && !!workspace?.hasData);
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

{#if workspace}
  <div class="mb-5 rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm" role="status">
    <span class="font-medium text-content">{$t("storagePolicy.workspace.summary.heading")}:</span>
    <span class="text-muted">
      {#if isEmpty}
        {$t("storagePolicy.workspace.summary.none")}
      {:else if workspace.ownerKind === "local-vault"}
        {$t("storagePolicy.workspace.summary.localVault", { mode: modeLabel })}
      {:else if workspace.ownerKind === "account"}
        {$t("storagePolicy.workspace.summary.account", { mode: modeLabel, owner: ownerLabel })}
      {:else}
        {$t("storagePolicy.workspace.summary.unclaimed", { mode: modeLabel })}
      {/if}
    </span>
  </div>
{/if}

{#if errorMsg}
  <Alert severity="danger" class="mb-5">{errorMsg}</Alert>
{/if}

<div class="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 md:gap-8">
  <!-- Option A: Local Mode -->
  <Card padded={false} class="relative flex flex-col p-5 sm:p-6 {opensWithPassphrase && !isEmpty ? 'ring-2 ring-primary' : ''}">
    <Badge severity="primary" class="absolute top-3 right-3 sm:top-5 sm:right-5">
      {opensWithPassphrase && !isEmpty
        ? $t("storagePolicy.workspace.summary.yours")
        : $t("auth.unlock.local.noAccountRequired")}
    </Badge>
    <div class="mb-2 flex items-center gap-3 pr-24">
      <Icon icon={faShieldHalved} class="shrink-0 text-3xl text-accent" />
      <h2 class="m-0 text-xl font-medium text-content">{$t("auth.unlock.local.startWorkspace")}</h2>
    </div>
    <p class="m-0 mb-3 text-sm leading-snug text-muted">
      {$t("auth.unlock.local.description")}
    </p>
    <ul class="m-0 mb-6 flex flex-1 list-none flex-col gap-2.5 p-0 text-sm [overflow-wrap:anywhere] text-content">
      <li>{$t("auth.unlock.local.featureNoRegistration")}</li>
      <li>{$t("auth.unlock.local.featureEncrypted")}</li>
      <li>{$t("auth.unlock.local.featureExportImport")}</li>
    </ul>

    {#if localDoorHint}
      <Alert severity="info" class="mb-3">
        {$t("storagePolicy.workspace.summary.localCardAccountOwned", { owner: ownerLabel })}
      </Alert>
    {/if}

    {#if needsLegacyMigration}
      <p class="m-0 mb-2 text-left text-sm leading-snug text-warning-fg">
        {$t("auth.unlock.local.legacyMigrationNotice")}
      </p>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); onUnlockLocal(); }} class="mt-auto flex w-full flex-col gap-3">
      <Field
        forId="localPassphrase"
        label={isNewLocalVault ? $t("auth.unlock.local.choosePassphrase") : $t("auth.unlock.local.workspacePassphrase")}
      >
        {#snippet children({ id })}
          <TextInput
            {id}
            type="password"
            autocomplete={isNewLocalVault ? "new-password" : "current-password"}
            bind:value={localPassphrase}
            placeholder={$t("auth.unlock.local.passphrasePlaceholder")}
            disabled={isLoading}
          />
        {/snippet}
      </Field>

      {#if isNewLocalVault}
        <Field forId="localPassphraseConfirm" label={$t("auth.unlock.local.repeatPassphrase")}>
          {#snippet children({ id })}
            <TextInput
              {id}
              type="password"
              autocomplete="new-password"
              bind:value={localPassphraseConfirm}
              disabled={isLoading}
            />
          {/snippet}
        </Field>
        <p class="m-0 mb-2 text-left text-sm leading-snug text-muted">
          {$t("auth.unlock.local.noRecoveryWarning")}
        </p>
      {/if}

      <Button type="submit" block disabled={isLoading}>
        {#if needsLegacyMigration}
          {$t("auth.unlock.local.setPassphraseAndMigrate")}
        {:else if isNewLocalVault}
          {$t("auth.unlock.local.createWorkspace")}
        {:else}
          {$t("auth.unlock.local.unlockWorkspace")}
        {/if}
      </Button>
    </form>
  </Card>

  <!-- Option B: Cloud Account -->
  <Card padded={false} class="relative flex flex-col p-5 sm:p-6 {opensWithAccount && !isEmpty ? 'ring-2 ring-primary' : ''}">
    <Badge severity="info" class="absolute top-3 right-3 sm:top-5 sm:right-5">
      {opensWithAccount && !isEmpty
        ? $t("storagePolicy.workspace.summary.yours")
        : $t("auth.unlock.cloud.schoolAccount")}
    </Badge>
    <div class="mb-2 flex items-center gap-3 pr-24">
      <Icon icon={faCloud} class="shrink-0 text-3xl text-info-fg" />
      <h2 class="m-0 text-xl font-medium text-content">{$t("auth.unlock.cloud.connectToServer")}</h2>
    </div>
    <p class="m-0 mb-3 text-sm leading-snug text-muted">
      {$t("auth.unlock.cloud.description")}
    </p>
    {#if accountDoorHint}
      <Alert severity="info" class="mb-3">{$t("storagePolicy.workspace.summary.cloudCardPassphraseOwned")}</Alert>
    {/if}

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
    </form>
  </Card>
</div>
