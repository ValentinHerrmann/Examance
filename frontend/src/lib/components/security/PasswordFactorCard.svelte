<script lang="ts">
  /**
   * The password, as a factor you can look at and change.
   *
   * Changing it from here re-wraps the data key in the browser and sends both to
   * the server in one request. The alternative — signing out and going through
   * the emailed reset — invalidates the password wrap and then asks for the
   * recovery code to undo the damage, which is an absurd amount of ceremony for
   * a routine change.
   */
  import { Button, Card, Field, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { ApiError } from "$lib/api/client";
  import { Argon2UnavailableError } from "$lib/crypto/keyDerivation";
  import { changePassword, type MfaStatus } from "$lib/api/mfa";
  import { envelopeSetToDto } from "$lib/api/keyEnvelopes";
  import { pinEnvelopeSet, rewrapForChangedPassword, vaultFromSession } from "$lib/services/keyEnvelopeService";
  import FactorMeta from "./FactorMeta.svelte";
  import LockoutNotice from "./LockoutNotice.svelte";

  export let status: MfaStatus;
  export let teacherId: string;
  export let onChanged: () => void;

  const MIN_LENGTH = 12;

  let isOpen = false;
  let currentPassword = "";
  let newPassword = "";
  let confirmPassword = "";
  let errorMsg = "";
  let successMsg = "";
  let isWorking = false;

  $: enrolled = status.enrolled.includes("password");
  $: opensData = status.key_capable.includes("password");

  function reset() {
    currentPassword = "";
    newPassword = "";
    confirmPassword = "";
    errorMsg = "";
  }

  async function submit() {
    errorMsg = "";
    successMsg = "";

    if (newPassword.length < MIN_LENGTH) {
      errorMsg = $t("security.password.tooShort", { count: MIN_LENGTH });
      return;
    }
    if (newPassword !== confirmPassword) {
      errorMsg = $t("security.password.mismatch");
      return;
    }

    // No open vault means no re-wrap, and the server would mark the password
    // wrap stale rather than guess — leaving the teacher needing their recovery
    // code for a change they made deliberately. Refuse instead.
    const vault = vaultFromSession();
    if (!vault) {
      errorMsg = $t("security.password.needsUnlock");
      return;
    }

    isWorking = true;
    try {
      const set = await rewrapForChangedPassword(teacherId, vault, newPassword);
      await changePassword(currentPassword, newPassword, envelopeSetToDto(set));
      // Written by the change request rather than by saveEnvelopes, so pin it
      // here: this browser built it and knows it is genuine.
      await pinEnvelopeSet(teacherId, set);

      successMsg = $t("security.password.changed");
      isOpen = false;
      reset();
      onChanged();
    } catch (err: unknown) {
      const code = err instanceof ApiError ? err.code : "";
      errorMsg =
        // Refusing beats writing a wrap that only the fallback KDF can open —
        // which is unrecoverable once the browser can load Argon2 again.
        err instanceof Argon2UnavailableError
          ? $t("security.vaultUnlock.kdfUnavailable")
          : code === "ERR_INVALID_CREDENTIALS"
            ? $t("security.password.wrongCurrent")
            : code === "ERR_ACCOUNT_LOCKED"
              ? $t("errors.code.ERR_ACCOUNT_LOCKED")
              : $t("security.password.failed");
    } finally {
      isWorking = false;
    }
  }
</script>

<Card>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="m-0 text-lg font-semibold text-accent">
        {$t("security.panel.factorPassword")}
      </h2>
      <span class="text-sm text-muted">
        {enrolled ? $t("security.page.statusEnrolled") : $t("security.page.statusMissing")}
      </span>
    </div>

    {#if enrolled}
      <FactorMeta
        createdAt={status.password_changed_at}
        lastUsedAt={status.password_last_used_at}
      />

      <p class="m-0 text-sm text-muted">
        {opensData ? $t("security.page.opensData") : $t("security.password.wrapStale")}
      </p>
    {:else}
      <p class="m-0 text-sm text-muted">{$t("security.password.notSet")}</p>
    {/if}

    {#if successMsg}
      <p class="m-0 text-sm text-content" role="status">{successMsg}</p>
    {/if}

    <!-- Changing a password runs the same per-account throttle as signing in. -->
    <LockoutNotice />

    {#if isOpen}
      <form
        class="flex flex-col gap-3"
        on:submit|preventDefault={submit}
      >
        <Field label={$t("security.password.current")}>
          <TextInput type="password" bind:value={currentPassword} required />
        </Field>
        <Field label={$t("security.password.new")} hint={$t("security.password.hint", { count: MIN_LENGTH })}>
          <TextInput type="password" bind:value={newPassword} required />
        </Field>
        <Field label={$t("security.password.confirm")}>
          <TextInput type="password" bind:value={confirmPassword} required />
        </Field>

        <p class="m-0 text-xs text-subtle">{$t("security.password.otherSessions")}</p>

        {#if errorMsg}
          <p class="m-0 text-sm text-red-400" role="alert">{errorMsg}</p>
        {/if}

        <div class="flex flex-wrap gap-2">
          <Button type="submit" disabled={isWorking} loading={isWorking}>
            {$t("security.password.submit")}
          </Button>
          <Button
            variant="secondary"
            disabled={isWorking}
            onClick={() => {
              isOpen = false;
              reset();
            }}
          >
            {$t("security.password.cancel")}
          </Button>
        </div>
      </form>
    {:else if enrolled}
      <div>
        <Button variant="secondary" onClick={() => (isOpen = true)}>
          {$t("security.password.change")}
        </Button>
      </div>
    {/if}
  </div>
</Card>
