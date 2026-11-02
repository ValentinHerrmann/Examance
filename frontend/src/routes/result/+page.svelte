<script lang="ts">
  // A student's shared result (issue #207, docs/dev/result_sharing.md): public, no session. The link fragment never reaches the server; the PDF is decrypted only here.
  import { onDestroy, onMount } from "svelte";
  import { faDownload, faLock } from "@fortawesome/free-solid-svg-icons";
  import { ApiError } from "#lib/api/client";
  import { openResultShare } from "#lib/api/resultShares";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Field, Spinner, TextInput } from "#lib/components/ui";
  import AuthCard from "#lib/components/unlock/AuthCard.svelte";
  import {
    lookupSecret,
    openSealedShare,
    parseShareFragment,
    type SealedShare,
    type ShareFactor,
    type ShareLink,
  } from "#lib/sharing/shareCrypto";
  import { formatDate } from "#lib/utils/format";

  type Phase = "loading" | "code" | "ready" | "error";

  let phase = $state<Phase>("loading");
  let message = $state("");
  let code = $state("");
  let codeError = $state("");
  let unlocking = $state(false);
  let factor = $state<ShareFactor>("none");
  let expiresAt = $state("");
  let examTitle = $state("");
  let filename = $state("");
  let pdfUrl = $state("");
  let link: ShareLink | null = null;
  let sealed: SealedShare | null = null;

  async function decryptWith(input: string | null): Promise<boolean> {
    if (!link || !sealed) return false;
    try {
      const { header, pdf } = await openSealedShare(link, factor, input, sealed);
      examTitle = header.examTitle;
      filename = header.filename || "result.pdf";
      pdfUrl = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
      phase = "ready";
      return true;
    } catch {
      return false;
    }
  }

  onMount(async () => {
    link = parseShareFragment(window.location.hash);
    if (!link) {
      phase = "error";
      message = translate("sharing.portal.invalid");
      return;
    }
    try {
      const res = await openResultShare(link.shareId, await lookupSecret(link));
      factor = res.factor;
      expiresAt = res.expiresAt;
      sealed = res.sealed;
    } catch (err) {
      phase = "error";
      message = translate(err instanceof ApiError && err.status === 404 ? "sharing.portal.notFound" : "sharing.portal.failed");
      return;
    }
    if (factor !== "none") {
      phase = "code";
    } else if (!(await decryptWith(null))) {
      phase = "error";
      message = translate("sharing.portal.failed");
    }
  });

  onDestroy(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  });

  async function unlock() {
    if (!code.trim()) return;
    unlocking = true;
    codeError = "";
    if (!(await decryptWith(code))) codeError = translate("sharing.portal.wrongCode");
    unlocking = false;
  }
</script>

<svelte:head>
  <title>{$t("sharing.portal.title")}</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<AuthCard title={$t("sharing.portal.title")} subtitle={examTitle || undefined}>
  {#if phase === "loading"}
    <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.portal.loading")}</div>
  {:else if phase === "error"}
    <Alert severity="danger">{message}</Alert>
  {:else if phase === "code"}
    <form onsubmit={(e) => { e.preventDefault(); unlock(); }} class="flex flex-col gap-5">
      <p class="m-0 text-sm text-content">
        {factor === "sticker" ? $t("sharing.portal.stickerPrompt") : $t("sharing.portal.codePrompt")}
      </p>
      <Field forId="share-code" label={$t("sharing.portal.codeLabel")} error={codeError || undefined}>
        {#snippet children({ id })}
          <TextInput
            {id}
            bind:value={code}
            placeholder="ABCD-EFGH"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            invalid={!!codeError}
            disabled={unlocking}
            class="font-mono tracking-widest"
          />
        {/snippet}
      </Field>
      <Button type="submit" block icon={faLock} loading={unlocking} disabled={unlocking || !code.trim()}>
        {$t("sharing.portal.unlock")}
      </Button>
    </form>
  {:else}
    <Alert severity="success" class="mb-5">{$t("sharing.portal.ready")}</Alert>
    <Button href={pdfUrl} download={filename} block icon={faDownload}>{$t("sharing.portal.download")}</Button>
  {/if}

  {#if expiresAt && phase !== "error"}
    <p class="m-0 mt-5 text-sm text-muted">{$t("sharing.portal.expires", { date: formatDate(expiresAt) })}</p>
  {/if}
  <p class="m-0 mt-2 text-xs text-subtle">{$t("sharing.portal.privacy")}</p>
</AuthCard>
