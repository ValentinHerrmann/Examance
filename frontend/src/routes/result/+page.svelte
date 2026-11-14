<script lang="ts">
  // A student's shared result (issue #207, docs/dev/result_sharing.md): public, no session. The link fragment never reaches the server; the PDFs are decrypted only here and shown view-only (no download button; a determined student can still capture the screen).
  import { onDestroy, onMount } from "svelte";
  import { faLock } from "@fortawesome/free-solid-svg-icons";
  import { ApiError } from "#lib/api/client";
  import { openResultShare, type SealedReview } from "#lib/api/resultShares";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Field, PageShell, Spinner, TextInput } from "#lib/components/ui";
  import AuthCard from "#lib/components/unlock/AuthCard.svelte";
  import ReviewForm from "#lib/components/sharing/ReviewForm.svelte";
  import DualPdfPreview from "#lib/components/DualPdfPreview.svelte";
  import PdfEmbedViewer from "#lib/components/PdfEmbedViewer.svelte";
  import {
    lookupSecret,
    openSealedShare,
    parseShareFragment,
    type ReviewItem,
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
  let gradedUrl = $state("");
  let solutionUrl = $state("");
  let contentUpdatedAt = $state<string | null>(null);
  let reviewUntil = $state<string | null>(null);
  let reviewItems = $state.raw<ReviewItem[]>([]);
  let contentKey = $state.raw<Uint8Array | null>(null);
  let lookup = $state.raw<Uint8Array | null>(null);
  let review = $state.raw<SealedReview | null>(null);
  let link = $state.raw<ShareLink | null>(null);
  let sealed: SealedShare | null = null;

  const pdfUrl = (bytes: Uint8Array) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));

  async function decryptWith(input: string | null): Promise<boolean> {
    if (!link || !sealed) return false;
    try {
      const opened = await openSealedShare(link, factor, input, sealed);
      const { header, documents } = opened;
      contentKey = opened.contentKey;
      reviewItems = header.items ?? [];
      examTitle = header.examTitle;
      gradedUrl = pdfUrl(documents.graded);
      if (documents.solution) solutionUrl = pdfUrl(documents.solution);
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
      lookup = await lookupSecret(link);
      const res = await openResultShare(link.shareId, lookup);
      contentUpdatedAt = res.contentUpdatedAt;
      reviewUntil = res.reviewUntil;
      review = res.review;
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
    if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    if (solutionUrl) URL.revokeObjectURL(solutionUrl);
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

{#if phase === "ready"}
  <PageShell width="full" class="flex flex-col gap-3">
    <header class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h1 class="m-0 min-w-0 truncate text-xl font-semibold">{examTitle || $t("sharing.portal.title")}</h1>
      {#if expiresAt}
        <span class="text-sm text-muted">{$t("sharing.portal.expires", { date: formatDate(expiresAt) })}</span>
      {/if}
      {#if contentUpdatedAt}
        <span class="w-full text-sm text-muted">{$t("review.form.updatedOn", { date: formatDate(contentUpdatedAt) })}</span>
      {/if}
    </header>
    {#if solutionUrl}
      <!-- A flex column with a fixed height: DualPdfPreview's flex-1 fills it, while a content-sized parent shrinks it to its minimum (issue #210). -->
      <div class="flex h-[75dvh] min-h-0 min-w-0 flex-col">
        <DualPdfPreview
          previewPdfUrl={gradedUrl}
          previewSolutionPdfUrl={solutionUrl}
          showLoesungPreview={true}
          titleAngabe={$t("sharing.portal.gradedTitle")}
          titleLoesung={$t("sharing.portal.solutionTitle")}
          downloadable={false}
        />
      </div>
    {:else}
      <div class="h-[75dvh] min-h-0 min-w-0 overflow-hidden rounded-md border border-line bg-surface-viewer">
        <PdfEmbedViewer src={gradedUrl} />
      </div>
    {/if}
    {#if reviewUntil && reviewItems.length > 0 && link && lookup && contentKey}
      <ReviewForm shareId={link.shareId} {lookup} {contentKey} items={reviewItems} {reviewUntil} {review} />
    {/if}
    <p class="m-0 text-xs text-subtle">{$t("sharing.portal.privacy")}</p>
  </PageShell>
{:else}
  <AuthCard title={$t("sharing.portal.title")}>
    {#if phase === "loading"}
      <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.portal.loading")}</div>
    {:else if phase === "error"}
      <Alert severity="danger">{message}</Alert>
    {:else}
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
    {/if}
    {#if expiresAt && phase !== "error"}
      <p class="m-0 mt-5 text-sm text-muted">{$t("sharing.portal.expires", { date: formatDate(expiresAt) })}</p>
    {/if}
    <p class="m-0 mt-2 text-xs text-subtle">{$t("sharing.portal.privacy")}</p>
  </AuthCard>
{/if}
