<script lang="ts">
  import { onMount } from "svelte";
  import { faTrash, faUpload } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Card } from "#lib/components/ui";
  import LogoPreview from "./LogoPreview.svelte";
  import {
    LOGO_ACCEPT,
    LogoError,
    deleteAccountLogo,
    fetchAccountLogo,
    getAccountLogoInfo,
    readLogoFile,
    uploadAccountLogo,
    type LogoMime,
  } from "#lib/latex/logo";

  /** The account logo (issue #46): printed in the header of every exam that does not override it. */

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

  async function load() {
    loading = true;
    error = "";
    try {
      const info = await getAccountLogoInfo();
      if (info.source === "none") {
        bytes = null;
        mime = null;
      } else {
        bytes = await fetchAccountLogo();
        mime = info.mime_type;
      }
    } catch (err) {
      error = messageOf(err);
    } finally {
      loading = false;
    }
  }

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    busy = true;
    error = "";
    try {
      const picked = await readLogoFile(file);
      const info = await uploadAccountLogo(picked.bytes);
      bytes = picked.bytes;
      mime = info.mime_type;
    } catch (err) {
      error = messageOf(err);
    } finally {
      busy = false;
    }
  }

  async function handleRemove() {
    if (!confirm(translate("logo.account.removeConfirm"))) return;
    busy = true;
    error = "";
    try {
      await deleteAccountLogo();
      bytes = null;
      mime = null;
    } catch (err) {
      error = messageOf(err);
    } finally {
      busy = false;
    }
  }

  onMount(load);
</script>

<div id="logo" class="scroll-mt-16 lg:scroll-mt-4">
  <Card title={$t("logo.account.heading")}>
    <p class="mt-0 mb-3 text-sm text-muted">{$t("logo.account.description")}</p>
    {#if error}
      <Alert severity="danger" class="mb-3" onDismiss={() => (error = "")}>{error}</Alert>
    {/if}
    <div class="flex flex-wrap items-center gap-3">
      <LogoPreview {bytes} {mime} />
      <div class="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          icon={faUpload}
          disabled={loading}
          loading={busy}
          onClick={() => fileInput?.click()}
        >
          {bytes ? $t("logo.replace") : $t("logo.upload")}
        </Button>
        {#if bytes}
          <Button variant="outlined" severity="danger" icon={faTrash} disabled={busy} onClick={handleRemove}>
            {$t("logo.remove")}
          </Button>
        {/if}
      </div>
    </div>
    <input bind:this={fileInput} type="file" accept={LOGO_ACCEPT} class="hidden" onchange={handleFile} />
    <p class="mt-3 mb-0 text-xs text-muted">{$t("logo.formats")}</p>
  </Card>
</div>
