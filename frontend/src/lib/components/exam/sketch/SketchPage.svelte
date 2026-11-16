<script lang="ts">
  import type { SheetSketchModel, SketchPageModel, SketchPart } from "#lib/exam/sheetSketch";
  import type { RenderedPage } from "#lib/pdf/renderPages";
  import { SAMPLE_MC_URI, SAMPLE_REST_URI } from "#lib/exam/layoutSample";
  import { FIDUCIAL, FOLD_STRIP, MM, PAGE_CODE, STICKER_SPOT, TAB_SIDE, TAB_TOP } from "#lib/qr/cutCorner";

  /** One A4 page of the Layout step's preview (issue #272), in millimetres: the sample's page image with every layout option drawn over it, or a drawn writing page. Without an image the content is sketched. */
  interface Props {
    model: SheetSketchModel;
    page: SketchPageModel;
    /** The sample's page; null for extra and filler pages, or while the sample is not compiled. */
    image?: RenderedPage | null;
    /** The element to stress, e.g. while its option is hovered. */
    highlight?: SketchPart | null;
    /** Thumbnails skip text and fine detail. */
    thumb?: boolean;
    /** Numbered badges beside these elements, matching the preview's "on this page" list. */
    callouts?: SketchPart[];
    class?: string;
  }

  let { model, page, image = null, highlight = null, thumb = false, callouts = [], class: className = "" }: Props = $props();

  // A sample student as stickers and copies print them (`labelParts`: number, two spaces, name); page content, so German.
  const SAMPLE_LABEL = "07  Muster, Max";
  const SAMPLE_KEY = "Schlüssel ABCD-EFGH";
  const SAMPLE_HAND = "Max Muster";
  const TAB_ANGLE = (Math.atan2(TAB_SIDE, TAB_TOP) * 180) / Math.PI;

  const W = 210;
  const H = 297;
  const mm = (pt: number) => pt / MM;
  const fid = { size: mm(FIDUCIAL.size), inset: mm(FIDUCIAL.inset), top: mm(FIDUCIAL.top), cut: mm(FIDUCIAL.cutSide), cutCodes: mm(FIDUCIAL.cutSideWithCodes), fold: mm(FIDUCIAL.foldSide) };
  const spot = { size: mm(STICKER_SPOT.size), side: mm(STICKER_SPOT.fromSide), sideBooklet: mm(STICKER_SPOT.fromSideBooklet), top: mm(STICKER_SPOT.top) };
  const code = { from: mm(PAGE_CODE.fromCutSide), size: mm(PAGE_CODE.size), bottom: mm(PAGE_CODE.bottomFromTop) };
  const tab = { top: mm(TAB_TOP), side: mm(TAB_SIDE) };
  const fold = mm(FOLD_STRIP);

  let right = $derived(page.cutSide === "right");
  /** x of an element *w* wide placed *d* from the cut side, or from the other side. */
  const fromCut = (d: number, w: number) => (right ? W - d - w : d);
  const fromOther = (d: number, w: number) => (right ? d : W - d - w);
  let lit = $derived((part: SketchPart) => highlight === part);
  // The page is white in both themes, so print marks use ink, never theme text colours (they vanish on white in dark mode).
  const tone = (_part: SketchPart, on: boolean) => (on ? "text-accent" : "text-ink");

  const link = (uri: string) => image?.links.find((l) => l.uri === uri) ?? null;
  // The sample's QR box, else where the sty puts it (3.5 cm square at the text edge under the header).
  let qrBox = $derived(link("omr://__qr__") ?? { x: 20, y: 40, w: 35, h: 35 });
  let mcAt = $derived(link(SAMPLE_MC_URI));
  let restAt = $derived(link(SAMPLE_REST_URI));
  const paperColor = "var(--color-paper)";

  /** Rows of a page code or printed QR, as a fixed pseudo-random pattern (a real code would need the payload). */
  function qrCells(x: number, y: number, size: number, n = 9) {
    const cells: { x: number; y: number; s: number }[] = [];
    const s = size / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const finder = (i < 3 && j < 3) || (i < 3 && j > n - 4) || (i > n - 4 && j < 3);
        if (finder || (i * 7 + j * 13 + i * j) % 3 === 0) cells.push({ x: x + j * s, y: y + i * s, s });
      }
    return cells;
  }

  /** The writing paper's lines in a box. */
  function pattern(x: number, y: number, w: number, h: number) {
    if (model.paper === "empty" || h <= 0) return [] as { x1: number; y1: number; x2: number; y2: number }[];
    const step = model.paper === "squared" ? 5 : 8;
    const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let yy = y; yy <= y + h; yy += step) out.push({ x1: x, y1: yy, x2: x + w, y2: yy });
    if (model.paper === "squared") for (let xx = x; xx <= x + w; xx += step) out.push({ x1: xx, y1: y, x2: xx, y2: y + h });
    return out;
  }

  let writingPage = $derived(page.role === "extra" || page.role === "filler");
  /** The writing area of this page: a whole writing page, or the last page's rest area. */
  let writing = $derived.by(() => {
    if (writingPage) return { x: 20, y: 42, w: W - 40, h: H - 42 - 22 };
    if (page.role === "last" && model.restArea) {
      const top = (restAt?.y ?? 200) + 12;
      return { x: 20, y: top, w: W - 40, h: H - 48 - top };
    }
    return null;
  });

  /** Where a part's numbered badge goes: beside the element, inside the page. */
  function anchorOf(part: SketchPart): { x: number; y: number } | null {
    switch (part) {
      case "logo":
        return { x: fromOther(15, 40) + (right ? 45 : -5), y: 12.5 };
      case "cornerTab":
        return { x: right ? W - 6 : 6, y: 26 };
      case "scanAids":
        return { x: fid.inset + fid.size + 6, y: H - fid.inset - fid.size / 2 };
      case "pageCodes":
        return { x: fromCut(code.from, code.size) + (right ? -5 : code.size + 5), y: code.bottom - code.size / 2 };
      case "stickers": {
        const sx = fromOther(page.foldSide ? spot.sideBooklet : spot.side, spot.size);
        return { x: right ? sx + spot.size + 5 : sx - 5, y: spot.top + 6 };
      }
      case "qr":
        return { x: qrBox.x - 4.5, y: qrBox.y + 4 };
      case "name":
        return { x: W - 16, y: qrBox.y + 4 };
      case "mcHint":
        return mcAt ? { x: mcAt.x - 4.5, y: mcAt.y - 4 } : { x: 15.5, y: 160 };
      case "fold":
        return { x: page.foldSide === "left" ? fold + 5 : W - fold - 5, y: 150 };
      case "notes":
        return { x: 15.5, y: (writing?.y ?? 40) - 6 };
      case "paper":
        return { x: 15.5, y: (writing?.y ?? 40) + 10 };
      default:
        return null;
    }
  }

  /** Placeholder text lines for a page sketched without the sample. */
  function lines(y: number, to: number, step = 7) {
    const out: { y: number; w: number }[] = [];
    for (let yy = y, i = 0; yy <= to; yy += step, i++) out.push({ y: yy, w: i % 4 === 3 ? 100 : W - 40 });
    return out;
  }
</script>

{#snippet glow(part: SketchPart, x: number, y: number, w: number, h: number)}
  {#if lit(part)}
    <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx="2" fill="none" stroke="currentColor" stroke-width="1.6" class="text-accent" opacity="0.9" />
  {/if}
{/snippet}

{#snippet sticker(x: number, y: number, w: number, h: number)}
  <!-- A QR name sticker as the sticker sheet prints it: name above the code (qr/stickerSheet.ts). -->
  {@const q = Math.min(w - 4, h - (thumb ? 3 : 7))}
  <g class={tone("qr", lit("qr") || lit("stickers"))}>
    <rect {x} {y} width={w} height={h} rx="1.5" fill={paperColor} stroke="currentColor" stroke-width="0.3" />
    {#if !thumb}<text x={x + w / 2} y={y + 4} font-size="2.8" font-weight="bold" text-anchor="middle" fill="currentColor">{SAMPLE_LABEL}</text>{/if}
    <g fill="currentColor">
      {#each qrCells(x + (w - q) / 2, y + h - q - 1.5, q, thumb ? 7 : 21) as c, i (i)}<rect x={c.x} y={c.y} width={c.s} height={c.s} />{/each}
    </g>
  </g>
{/snippet}

{#snippet badge(n: number, x: number, y: number)}
  <g>
    <circle cx={x} cy={y} r="3.6" fill="var(--color-ink)" />
    <text x={x} y={y + 1.45} font-size="4.2" font-weight="bold" text-anchor="middle" fill={paperColor}>{n}</text>
  </g>
{/snippet}

<svg viewBox="0 0 {W} {H}" class="block h-auto {className || 'w-full'}" aria-hidden="true" focusable="false">
  <rect x="0" y="0" width={W} height={H} fill={paperColor} />
  {#if image}
    <image href={image.url} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
  {:else if !writingPage}
    <!-- No sample yet: grey bars stand for the content. -->
    {#if page.role === "cover"}
      <rect x="60" y="22" width="90" height="6" rx="1" fill="var(--color-ink)" opacity="0.35" />
      {#each lines(qrBox.y + 14, qrBox.y + 30, 6) as l, i (i)}<rect x="62" y={l.y} width="120" height="2.5" rx="1" fill="var(--color-ink)" opacity="0.15" />{/each}
    {/if}
    {#each lines(page.role === "cover" ? 90 : 40, page.role === "last" ? 190 : H - 30) as l, i (i)}
      <rect x="20" y={l.y} width={l.w} height="3" rx="1" fill="var(--color-ink)" opacity="0.15" />
    {/each}
  {/if}

  <!-- Writing pages and the rest-of-page area: heading, note, paper. -->
  {#if writingPage}
    <rect x="20" y="22" width={W - 40} height="14" fill={paperColor} />
    {#if !thumb}
      <text x="20" y="30" font-size="6" font-weight="bold" fill="currentColor" class={tone("notes", lit("notes"))}>{model.notesTitle}</text>
      <text x="20" y="37" font-size="4" fill="var(--color-ink)" opacity="0.55">{model.notesNote}</text>
    {:else}
      <rect x="20" y="26" width="60" height="5" rx="1" fill="var(--color-ink)" opacity="0.35" />
    {/if}
  {:else if writing && !thumb}
    <text x="20" y={writing.y - 4} font-size="5" font-weight="bold" fill="currentColor" class={tone("notes", lit("notes"))}>{model.notesTitle}</text>
  {/if}
  {#if writing}
    <g stroke="currentColor" stroke-width={lit("paper") ? 0.5 : 0.25} class={tone("paper", lit("paper"))} opacity="0.7">
      {#each pattern(writing.x, writing.y, writing.w, writing.h) as p, i (i)}<line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />{/each}
    </g>
    {@render glow("paper", writing.x, writing.y, writing.w, writing.h)}
  {/if}

  {#if page.role === "cover"}
    <!-- The sample prints the name line and the QR box; what this exam leaves out is masked. -->
    {#if !model.nameLine}
      <rect x={qrBox.x + qrBox.w + 4} y={qrBox.y - 1} width={W - 20 - qrBox.x - qrBox.w - 4} height="12" fill={paperColor} />
    {:else}
      {#if !link("omr://__qr__") && !thumb}
        <!-- No sample page: draw the line the sty prints. -->
        <text x={qrBox.x + qrBox.w + 6} y={qrBox.y + 9} font-size="4.5" fill="var(--color-ink)">Name:</text>
        <line x1={qrBox.x + qrBox.w + 20} y1={qrBox.y + 9} x2={W - 20} y2={qrBox.y + 9} stroke="var(--color-ink)" stroke-width="0.3" />
      {/if}
      {#if !thumb}<text x={qrBox.x + qrBox.w + 22} y={qrBox.y + 7.5} font-size="6" font-family="'Segoe Script', 'Bradley Hand', cursive" fill="var(--color-ink)" class={lit("name") ? "" : "opacity-80"}>{SAMPLE_HAND}</text>{/if}
      {@render glow("name", qrBox.x + qrBox.w + 5, qrBox.y, W - 25 - qrBox.x - qrBox.w - 5, 10)}
    {/if}
    {#if model.qr === "none"}
      <rect x={qrBox.x - 1} y={qrBox.y - 1} width={qrBox.w + 2} height={qrBox.h + 2} fill={paperColor} />
    {:else if model.qr === "printed"}
      <rect x={qrBox.x - 1} y={qrBox.y - 1} width={qrBox.w + 2} height={qrBox.h + 2} fill={paperColor} />
      <g fill="currentColor" class={tone("qr", lit("qr"))}>
        {#each qrCells(qrBox.x + 3, qrBox.y + 3, qrBox.w - 6, 21) as c, i (i)}<rect x={c.x} y={c.y} width={c.s} height={c.s} />{/each}
      </g>
    {:else if !link("omr://__qr__")}
      <!-- No sample page (or one without the box): draw the sticker box itself. -->
      <rect x={qrBox.x} y={qrBox.y} width={qrBox.w} height={qrBox.h} fill={paperColor} stroke="currentColor" stroke-width="0.4" stroke-dasharray="2 1.5" class={tone("qr", lit("qr"))} />
      {#if !thumb}<text x={qrBox.x + qrBox.w / 2} y={qrBox.y + 10} text-anchor="middle" font-size="4" fill="var(--color-ink)" opacity="0.55">QR Code</text>{/if}
    {/if}
    {#if model.qr === "sticker"}
      {@render sticker(qrBox.x + 2, qrBox.y + 2, qrBox.w - 4, model.initials ? qrBox.h - 16 : qrBox.h - 4)}
    {/if}
    {#if model.qr === "printed"}
      <!-- Name and key along the cut line, on the corner that is cut off before handing out (qr/examCopies.ts). -->
      {#if !thumb}
        {@const along = (t: number, k: number) => ({ x: W - tab.top + t * tab.top + k * Math.sin((TAB_ANGLE * Math.PI) / 180), y: t * tab.side - k * Math.cos((TAB_ANGLE * Math.PI) / 180) })}
        {@const a = along(0.64, 2.8)}
        {@const b = along(0.64, 6.4)}
        <g class={tone("cornerTab", lit("cornerTab"))} fill="currentColor">
          <text x={a.x} y={a.y} font-size="3" font-weight="bold" text-anchor="middle" transform="rotate({TAB_ANGLE} {a.x} {a.y})">{SAMPLE_LABEL}</text>
          <text x={b.x} y={b.y} font-size="2.6" font-family="monospace" text-anchor="middle" transform="rotate({TAB_ANGLE} {b.x} {b.y})">{SAMPLE_KEY}</text>
        </g>
      {/if}
      {#if lit("cornerTab")}<path d="M {W - tab.top} 0 L {W} 0 L {W} {tab.side} Z" fill="none" stroke="currentColor" stroke-width="1.2" class="text-accent" />{/if}
    {/if}
    {#if model.qr === "sticker" && model.initials}
      <!-- The box's initials field, printed when no name line names the student. -->
      <g class={tone("qr", lit("qr"))}>
        <line x1={qrBox.x + 5} y1={qrBox.y + qrBox.h - 12} x2={qrBox.x + qrBox.w - 5} y2={qrBox.y + qrBox.h - 12} stroke="currentColor" stroke-width="0.4" />
        {#if !thumb}<text x={qrBox.x + qrBox.w / 2} y={qrBox.y + qrBox.h - 7} text-anchor="middle" font-size="3" fill="currentColor">↑ Deine Initialen ↑</text>{/if}
      </g>
    {/if}
    {#if model.qr !== "none"}{@render glow("qr", qrBox.x, qrBox.y, qrBox.w, qrBox.h)}{/if}
    {#if model.logo}
      <rect x={fromOther(15, 40)} y="8" width="40" height="9" rx="1" fill="none" stroke="currentColor" stroke-dasharray="1.5 1" class={tone("logo", lit("logo"))} />
      {#if !thumb}<text x={fromOther(15, 40) + 20} y="14" text-anchor="middle" font-size="4" fill="currentColor" class={tone("logo", lit("logo"))}>Logo</text>{/if}
      {@render glow("logo", fromOther(15, 40), 8, 40, 9)}
    {/if}
  {/if}

  {#if mcAt}
    {#if !model.mcHint}
      <rect x={mcAt.x} y={mcAt.y - 7} width={mcAt.w} height="6.5" fill={paperColor} />
    {:else}
      {@render glow("mcHint", mcAt.x, mcAt.y - 7, mcAt.w, 6.5)}
    {/if}
  {/if}

  {#if page.foldSide}
    <g class={tone("fold", lit("fold"))}>
      <rect x={page.foldSide === "left" ? 0 : W - fold} y="0" width={fold} height={H} fill="currentColor" opacity="0.07" />
      <line x1={page.foldSide === "left" ? fold : W - fold} y1="0" x2={page.foldSide === "left" ? fold : W - fold} y2={H} stroke="currentColor" stroke-width="0.5" stroke-dasharray="3 2" />
    </g>
    {@render glow("fold", page.foldSide === "left" ? 0 : W - fold, 0, fold, H)}
  {/if}

  {#if page.stickerSpot}
    {@const sx = fromOther(page.foldSide ? spot.sideBooklet : spot.side, spot.size)}
    <rect x={sx} y={spot.top} width={spot.size} height={spot.size} fill={paperColor} />
    <rect x={sx} y={spot.top} width={spot.size} height={spot.size} rx="2" fill="currentColor" opacity="0.06" stroke="currentColor" stroke-width="0.4" class={tone("stickers", lit("stickers"))} />
    {#if model.qr === "sticker"}{@render sticker(sx + 3, spot.top + 3, spot.size - 6, spot.size - 6)}{/if}
    {@render glow("stickers", sx, spot.top, spot.size, spot.size)}
  {/if}

  <!-- The cut tab: tinted, its dashed cut line from 75 mm along the top to 20 mm down the side; personalised copies draw it on every page even without scan aids (qr/examCopies.ts). -->
  {#if model.scanAids || model.qr === "printed"}
    <g class={tone(model.qr === "printed" ? "cornerTab" : "scanAids", lit("scanAids") || (page.number === 1 && lit("cornerTab")))}>
      <path d={right ? `M ${W - tab.top} 0 L ${W} 0 L ${W} ${tab.side} Z` : `M ${tab.top} 0 L 0 0 L 0 ${tab.side} Z`} fill="currentColor" opacity="0.07" />
      <line x1={right ? W - tab.top : tab.top} y1="0" x2={right ? W : 0} y2={tab.side} stroke="currentColor" stroke-width="0.5" stroke-dasharray="3 2" opacity="0.5" />
    </g>
  {/if}
  {#if model.scanAids}
    {@const cutX = model.pageCodes ? fid.cutCodes : fid.cut}
    {@const otherX = page.foldSide ? fid.fold : fid.inset}
    <g class={tone("scanAids", lit("scanAids"))}>
      <g fill="currentColor">
        <rect x={fromCut(cutX, fid.size)} y={fid.top - fid.size} width={fid.size} height={fid.size} />
        <rect x={fromOther(otherX, fid.size)} y={fid.top - fid.size} width={fid.size} height={fid.size} />
        <rect x={fid.inset} y={H - fid.inset - fid.size} width={fid.size} height={fid.size} />
        <rect x={W - fid.inset - fid.size} y={H - fid.inset - fid.size} width={fid.size} height={fid.size} />
      </g>
    </g>
    {#if lit("scanAids")}
      {@render glow("scanAids", fromCut(cutX, fid.size), fid.top - fid.size, fid.size, fid.size)}
      {@render glow("scanAids", fid.inset, H - fid.inset - fid.size, fid.size, fid.size)}
    {/if}
  {/if}

  {#if model.pageCodes}
    {@const cx = fromCut(code.from, code.size)}
    <g fill="currentColor" class={tone("pageCodes", lit("pageCodes"))}>
      {#each qrCells(cx, code.bottom - code.size, code.size, thumb ? 5 : 11) as c, i (i)}<rect x={c.x} y={c.y} width={c.s} height={c.s} />{/each}
    </g>
    {@render glow("pageCodes", cx, code.bottom - code.size, code.size, code.size)}
  {/if}

  {#if !thumb}
    {#each callouts as part, i (part)}
      {@const at = anchorOf(part)}
      {#if at}{@render badge(i + 1, at.x, at.y)}{/if}
    {/each}
  {/if}

  <rect x="0.25" y="0.25" width={W - 0.5} height={H - 0.5} fill="none" stroke="var(--color-line-strong)" stroke-width="0.5" />
</svg>
