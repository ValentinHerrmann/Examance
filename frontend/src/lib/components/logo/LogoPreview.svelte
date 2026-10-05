<script lang="ts">
  import { faFilePdf, faImage } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Icon } from "#lib/components/ui";
  import type { LogoMime } from "#lib/latex/logo";

  interface Props {
    /** Logo bytes; null shows the "no logo" placeholder. */
    bytes: Uint8Array | null;
    mime: LogoMime | null;
  }

  let { bytes, mime }: Props = $props();

  let imageUrl = $state<string | null>(null);

  // Images are shown as they are; a PDF logo is only named (it is printed, not previewed here).
  $effect(() => {
    if (!bytes || !mime || mime === "application/pdf") {
      imageUrl = null;
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }));
    imageUrl = url;
    return () => URL.revokeObjectURL(url);
  });
</script>

<div class="flex h-16 w-48 max-w-full items-center justify-center rounded-md border border-line bg-surface-raised px-2">
  {#if imageUrl}
    <img src={imageUrl} alt={$t("logo.previewAlt")} class="max-h-12 max-w-full object-contain" />
  {:else if bytes && mime === "application/pdf"}
    <span class="inline-flex items-center gap-2 text-sm text-muted">
      <Icon icon={faFilePdf} class="text-xl" />
      {$t("logo.pdfLogo", { size: Math.max(1, Math.round(bytes.length / 1024)) })}
    </span>
  {:else}
    <span class="inline-flex items-center gap-2 text-sm text-subtle">
      <Icon icon={faImage} />
      {$t("logo.noLogo")}
    </span>
  {/if}
</div>
