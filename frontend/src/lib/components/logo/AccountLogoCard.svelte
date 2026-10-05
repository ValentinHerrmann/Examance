<script lang="ts">
  import { onMount } from "svelte";
  import { faBan, faRotateLeft, faUpload } from "@fortawesome/free-solid-svg-icons";
  import { t, translate, type TranslationKey } from "#lib/i18n";
  import { Alert, Badge, Button, Card } from "#lib/components/ui";
  import LogoPreview from "./LogoPreview.svelte";
  import {
    LOGO_ACCEPT,
    LogoError,
    fetchAccountLogo,
    getAccountLogoInfo,
    readLogoFile,
    setAccountLogo,
    type AccountLogoInfo,
    type AccountLogoMode,
    type LogoMime,
  } from "#lib/latex/logo";

  /**
   * The account logo (issue #46): printed in the header of every exam that does not override it.
   * Without a choice it is the bundled default (MTG); "reset" returns to that.
   */

  const MODE_LABEL = {
    default: "logo.mode.default",
    none: "logo.mode.none",
    custom: "logo.mode.custom",
  } as const satisfies Record<AccountLogoMode, TranslationKey>;

  let mode = $state<AccountLogoMode>("default");
  let bytes = $state.raw<Uint8Array | null>(null);
  let mime = $state<LogoMime | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state("");
  let fileInput: HTMLInputElement | undefined = $state();

  function messageOf(err: unknown): string {
    if (err instanceof LogoError) return translate(err.key);
    return (err as Error)?.message || translate("logo.errors.generic");
  }

  /** Shows what the account now prints; `picked` saves re-downloading a file just uploaded. */
  async function show(info: AccountLogoInfo, picked?: Uint8Array) {
    mode = info.mode;
    mime = info.mime_type;
    bytes = info.source === "none" ? null : (picked ?? (await fetchAccountLogo()));
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (err) {
      error = messageOf(err);
    } finally {
      busy = false;
    }
  }

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await run(async () => {
      const picked = await readLogoFile(file);
      await show(await setAccountLogo("custom", picked.bytes), picked.bytes);
    });
  }

  function handleNone() {
    if (!confirm(translate("logo.account.noneConfirm"))) return;
    void run(async () => show(await setAccountLogo("none")));
  }

  function handleReset() {
    if (!confirm(translate("logo.account.resetConfirm"))) return;
    void run(async () => show(await setAccountLogo("default")));
  }

  onMount(async () => {
    try {
      await show(await getAccountLogoInfo());
    } catch (err) {
      error = messageOf(err);
    } finally {
      loading = false;
    }
  });
</script>

<div id="logo" class="scroll-mt-16 lg:scroll-mt-4">
  <Card title={$t("logo.account.heading")}>
    <p class="mt-0 mb-3 text-sm text-muted">{$t("logo.account.description")}</p>
    {#if error}
      <Alert severity="danger" class="mb-3" onDismiss={() => (error = "")}>{error}</Alert>
    {/if}
    <div class="flex flex-wrap items-center gap-3">
      <LogoPreview {bytes} {mime} />
      {#if !loading}
        <Badge severity={mode === "custom" ? "success" : mode === "none" ? "secondary" : "info"}>
          {$t(MODE_LABEL[mode])}
        </Badge>
      {/if}
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button variant="outlined" icon={faUpload} disabled={loading} loading={busy} onClick={() => fileInput?.click()}>
        {mode === "custom" ? $t("logo.replace") : $t("logo.upload")}
      </Button>
      {#if !loading && mode !== "none"}
        <Button variant="outlined" severity="secondary" icon={faBan} disabled={busy} onClick={handleNone}>
          {$t("logo.account.useNone")}
        </Button>
      {/if}
      {#if !loading && mode !== "default"}
        <Button variant="outlined" severity="secondary" icon={faRotateLeft} disabled={busy} onClick={handleReset}>
          {$t("logo.account.reset")}
        </Button>
      {/if}
    </div>
    <input bind:this={fileInput} type="file" accept={LOGO_ACCEPT} class="hidden" onchange={handleFile} />
    <p class="mt-3 mb-0 text-xs text-muted">{$t("logo.formats")}</p>
  </Card>
</div>
