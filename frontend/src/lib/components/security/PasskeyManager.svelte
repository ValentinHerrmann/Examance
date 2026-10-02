<script lang="ts">
  /**
   * Register and remove passkeys.
   *
   * The panel is explicit about a distinction that is otherwise invisible: a
   * passkey whose authenticator lacks the PRF extension signs you in but cannot
   * unlock your encrypted data. Letting a teacher believe otherwise is how they
   * end up with an account they can reach and exams they cannot read.
   *
   * "Opens data" is read from the stored wraps, never from `supports_prf`: that
   * flag is a registration-time guess. A passkey without a wrap gets a button
   * that adds one from the open session — a passkey prompt, no password — and
   * that doubles as the test of whether its provider supports PRF at all.
   */
  import { Button, Card, Field, TextInput } from "$lib/components/ui";
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
  import { ApiError } from "$lib/api/client";
  import {
    deletePasskey,
    loginOptions,
    registrationOptions,
    verifyRegistration,
    type PasskeySummary,
  } from "$lib/api/webauthn";
  import { authenticate, isSupported, register } from "$lib/webauthn/client";
  import {
    addPasskeyWrap,
    enablePasskeyUnlock,
    passkeyWrapIds,
    PrfUnavailableError,
    sameCredential,
    vaultFromSession,
  } from "$lib/services/keyEnvelopeService";

  export let teacherId: string;
  /**
   * Owned by the page, not fetched here.
   *
   * Registering or removing a passkey changes which factors the account has, so
   * the factor summary has to move with it. A list this component loaded for
   * itself is how the old settings page ended up showing a stale one.
   */
  export let passkeys: PasskeySummary[];
  export let onChanged: () => void;

  let nickname = "";
  /** Credential ids with a usable wrap; null until loaded. */
  let wrapIds: string[] | null = null;
  /** Per-credential outcome of the last "enable" attempt. */
  let unlockNotes: Record<string, "done" | "noPrf"> = {};
  let enabling: string | null = null;
  /** A non-error message after registering (no PRF, or the wrap step pending). */
  let noticeMsg = "";

  /** Only the newest load may write: an older one finishing last would show stale state. */
  let wrapLoadSeq = 0;
  async function loadWrapIds() {
    const seq = ++wrapLoadSeq;
    let ids: string[] | null;
    try {
      ids = await passkeyWrapIds();
    } catch {
      ids = null;
    }
    if (seq === wrapLoadSeq) {
      wrapIds = ids;
    }
  }

  // Runs on mount too. The list moves after add/remove; the wraps move with it.
  // `passkeys` is named in the condition so Svelte re-runs this when it changes.
  $: if (passkeys) {
    void loadWrapIds();
  }

  function opensData(credentialIdB64: string, ids: string[] | null): boolean {
    return (ids ?? []).some((id) => sameCredential(id, credentialIdB64));
  }

  async function enableUnlock(credentialIdB64: string) {
    if (enabling) {
      return;
    }
    enabling = credentialIdB64;
    errorMsg = "";
    try {
      await enablePasskeyUnlock(teacherId, credentialIdB64);
      unlockNotes = { ...unlockNotes, [credentialIdB64]: "done" };
      await loadWrapIds();
    } catch (err: unknown) {
      if (err instanceof PrfUnavailableError) {
        unlockNotes = { ...unlockNotes, [credentialIdB64]: "noPrf" };
      } else {
        errorMsg = $t("security.passkey.failed");
      }
    } finally {
      enabling = null;
    }
  }
  let errorMsg = "";
  let isWorking = false;
  const supported = isSupported();

  async function add() {
    if (isWorking) {
      return;
    }
    isWorking = true;
    errorMsg = "";
    try {
      const options = await registrationOptions();
      // Registration reports whether PRF works here; it does not hand back the
      // secret, so the wrap below still needs one assertion. Both ceremonies use
      // the same application-wide PRF input, which is what makes the secret
      // reproducible at sign-in — the salt used to be per credential, and no
      // sign-in could know it before the ceremony.
      const result = await register(options);

      const summary = await verifyRegistration({
        handle: options.handle,
        challenge_b64: options.challenge_b64,
        credential_json: result.credentialJson,
        supports_prf: result.supportsPrf,
        nickname: nickname.trim() || null,
      });

      nickname = "";
      noticeMsg = "";

      const vault = vaultFromSession();
      if (vault) {
        // Wrap a copy of the data key under the authenticator's PRF secret, so
        // this passkey can also open the vault. Attempted even when registration
        // reported no PRF: some providers only evaluate it on an assertion. The
        // ceremony is pinned to the new credential, so no other passkey's
        // secret can end up sealing this wrap.
        try {
          const assertion = await authenticate(await loginOptions(), {
            credentialIdB64: summary.credential_id_b64,
          });
          if (assertion.prfOutput) {
            await addPasskeyWrap(teacherId, vault, summary.credential_id_b64, assertion.prfOutput);
          } else {
            unlockNotes = { ...unlockNotes, [summary.credential_id_b64]: "noPrf" };
          }
        } catch {
          // Registered all the same; only the wrap is outstanding.
          noticeMsg = $t("security.passkey.addedUnlockPending");
        }
      }

      onChanged();
    } catch {
      errorMsg = $t("security.passkey.failed");
    } finally {
      isWorking = false;
    }
  }

  async function remove(credentialIdB64: string) {
    errorMsg = "";
    try {
      await deletePasskey(credentialIdB64);
      onChanged();
    } catch (err: unknown) {
      // The server refuses when this is the last factor keeping the account
      // usable, and names the rule it hit — whether the account would fall below
      // two factors, or below its last means of decrypting its own data. Those
      // are different problems with different fixes, so pass the reason through.
      errorMsg =
        err instanceof ApiError && err.code === "ERR_LAST_FACTOR_PROTECTED"
          ? err.message
          : $t("security.passkey.removeBlocked");
    }
  }
</script>

<Card>
  <div class="flex flex-col gap-4">
    <div>
      <h2 class="m-0 text-lg font-semibold text-accent">{$t("security.passkey.title")}</h2>
      <p class="mt-1 text-sm text-muted">{$t("security.passkey.intro")}</p>
    </div>

    {#if !supported}
      <p class="m-0 text-sm text-muted">{$t("security.passkey.unsupported")}</p>
    {:else}
      {#if errorMsg}
        <p class="m-0 text-sm text-red-400" role="alert">{errorMsg}</p>
      {/if}
      {#if noticeMsg}
        <p class="m-0 text-sm text-muted" role="status">{noticeMsg}</p>
      {/if}

      {#if passkeys.length === 0}
        <p class="m-0 text-sm text-muted">{$t("security.passkey.none")}</p>
      {:else}
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          {#each passkeys as passkey (passkey.credential_id_b64)}
            <li
              class="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface-sunken
                     p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="m-0 truncate text-sm font-medium text-content">
                  {passkey.nickname || passkey.credential_id_b64.slice(0, 12)}
                </p>
                <p class="m-0 text-xs text-subtle">
                  {$t("security.passkey.created", {
                    date: $fmt.date(new Date(passkey.created_at)),
                  })}
                  ·
                  {passkey.last_used_at
                    ? $t("security.passkey.lastUsed", {
                        date: $fmt.date(new Date(passkey.last_used_at)),
                      })
                    : $t("security.passkey.neverUsed")}
                </p>
                {#if wrapIds !== null}
                  {#if opensData(passkey.credential_id_b64, wrapIds)}
                    <p class="m-0 mt-1 text-xs text-muted">{$t("security.passkey.opensData")}</p>
                    {#if unlockNotes[passkey.credential_id_b64] === "done"}
                      <p class="m-0 mt-1 text-xs text-accent" role="status">
                        {$t("security.passkey.enableUnlockDone")}
                      </p>
                    {/if}
                  {:else if unlockNotes[passkey.credential_id_b64] === "noPrf"}
                    <p class="m-0 mt-1 text-xs text-amber-300" role="alert">
                      {$t("security.passkey.noPrfWarning")}
                    </p>
                  {:else}
                    <p class="m-0 mt-1 text-xs text-amber-300">
                      {$t("security.passkey.notOpensData")}
                    </p>
                  {/if}
                {/if}
              </div>
              <div class="flex shrink-0 flex-wrap gap-2">
                {#if wrapIds !== null && !opensData(passkey.credential_id_b64, wrapIds) && unlockNotes[passkey.credential_id_b64] !== "noPrf"}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={enabling !== null}
                    loading={enabling === passkey.credential_id_b64}
                    onClick={() => enableUnlock(passkey.credential_id_b64)}
                  >
                    {$t("security.passkey.enableUnlock")}
                  </Button>
                {/if}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => remove(passkey.credential_id_b64)}
                >
                  {$t("security.passkey.remove")}
                </Button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      <Field label={$t("security.passkey.nicknameLabel")}>
        <TextInput bind:value={nickname} placeholder={$t("security.passkey.nicknamePlaceholder")} />
      </Field>

      <div>
        <Button disabled={isWorking} loading={isWorking} onClick={add}>
          {$t("security.passkey.add")}
        </Button>
      </div>
    {/if}
  </div>
</Card>
