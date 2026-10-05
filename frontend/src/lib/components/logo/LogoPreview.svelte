<script lang="ts">
  import { faImage } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Icon } from "#lib/components/ui";
  import type { LogoMime } from "#lib/latex/logo";
  import { loadPdfjs } from "#lib/pdf/pdfjs";

  interface Props {
    /** Logo bytes; null shows the "no logo" placeholder. */
    bytes: Uint8Array | null;
    mime: LogoMime | null;
    /** `sm` for list rows. */
    size?: "sm" | "md";
  }

  let { bytes, mime, size = "md" }: Props = $props();

  /** Rendered height of a PDF logo, in CSS pixels (times devicePixelRatio for sharpness). */
  const PDF_PREVIEW_HEIGHT = 96;

  let imageUrl = $state<string | null>(null);
  let failed = $state(false);

  /** First page of a PDF logo as a PNG data URL (img-src allows data:). */
  async function renderPdf(data: Uint8Array): Promise<string> {
    const pdfjs = await loadPdfjs();
    // pdf.js transfers the buffer to its worker; hand it a copy so `bytes` stays usable.
    const task = pdfjs.getDocument({ data: data.slice() });
    try {
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = (PDF_PREVIEW_HEIGHT * (window.devicePixelRatio || 1)) / base.height;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport } as any).promise;
      return canvas.toDataURL("image/png");
    } finally {
      void task.destroy();
    }
  }

  $effect(() => {
    const data = bytes;
    const type = mime;
    imageUrl = null;
    failed = false;
    if (!data || !type) return;

    if (type !== "application/pdf") {
      const url = URL.createObjectURL(new Blob([data.slice().buffer as ArrayBuffer], { type }));
      imageUrl = url;
      return () => URL.revokeObjectURL(url);
    }

    let cancelled = false;
    renderPdf(data).then(
      (url) => {
        if (!cancelled) imageUrl = url;
      },
      (err) => {
        console.warn("[logo] Could not render the PDF logo preview:", err);
        if (!cancelled) failed = true;
      }
    );
    return () => {
      cancelled = true;
    };
  });
</script>

<div
  class="flex max-w-full items-center justify-center rounded-md border border-line px-2 {imageUrl
    ? 'bg-paper'
    : 'bg-surface-raised'} {size === 'sm' ? 'h-10 w-32' : 'h-16 w-48'}"
>
  {#if imageUrl}
    <img
      src={imageUrl}
      alt={$t("logo.previewAlt")}
      class="max-w-full object-contain {size === 'sm' ? 'max-h-8' : 'max-h-12'}"
    />
  {:else if bytes && mime === "application/pdf" && !failed}
    <span class="text-xs text-subtle">…</span>
  {:else if bytes}
    <span class="text-xs text-muted">{$t("logo.pdfLogo", { size: Math.max(1, Math.round(bytes.length / 1024)) })}</span>
  {:else}
    <span class="inline-flex items-center gap-2 text-sm text-subtle">
      <Icon icon={faImage} />
      {$t("logo.noLogo")}
    </span>
  {/if}
</div>
