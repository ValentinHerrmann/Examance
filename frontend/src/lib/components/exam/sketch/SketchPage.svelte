<script lang="ts">
  import type { SheetSketchModel, SketchPageModel, SketchPart } from "#lib/exam/sheetSketch";
  import { FOLD_STRIP, MM, PAGE_CODE, TAB_SIDE, TAB_TOP } from "#lib/qr/cutCorner";

  /** One A4 page of the content-free layout sketch (issue #272), in millimetres; placeholders stand for content, the drawn elements for layout options. */
  interface Props {
    model: SheetSketchModel;
    page: SketchPageModel;
    /** The element to stress, e.g. while its option is hovered. */
    highlight?: SketchPart | null;
    class?: string;
  }

  let { model, page, highlight = null, class: className = "" }: Props = $props();

  const W = 210;
  const H = 297;
  const mm = (pt: number) => pt / MM;
  const tabTop = mm(TAB_TOP);
  const tabSide = mm(TAB_SIDE);
  const code = { from: mm(PAGE_CODE.fromCutSide), size: mm(PAGE_CODE.size), bottom: mm(PAGE_CODE.bottomFromTop) };
  const fold = mm(FOLD_STRIP);

  let right = $derived(page.cutSide === "right");
  /** x of an element *w* wide placed *d* from the cut side. */
  const fromCut = (d: number, w: number) => (right ? W - d - w : d);
  const fromOther = (d: number, w: number) => (right ? d : W - d - w);
  const hl = (part: SketchPart) => (highlight === part ? "text-accent" : "text-muted");
  const strong = (part: SketchPart) => (highlight === part ? 2.5 : 1.2);

  /** Placeholder text lines from *y* to *to*, in a column from *x* *w* wide. */
  function lines(x: number, y: number, w: number, to: number, step = 9) {
    const out: { x: number; y: number; w: number }[] = [];
    for (let yy = y, i = 0; yy <= to; yy += step, i++) out.push({ x, y: yy, w: i % 4 === 3 ? w * 0.6 : w });
    return out;
  }

  let pattern = $derived.by(() => {
    if (page.role !== "writing" || model.paper === "empty") return [] as { x1: number; y1: number; x2: number; y2: number }[];
    const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const step = model.paper === "squared" ? 10 : 12;
    for (let y = 56; y < H - 20; y += step) out.push({ x1: 20, y1: y, x2: W - 20, y2: y });
    if (model.paper === "squared") for (let x = 20; x <= W - 20; x += step) out.push({ x1: x, y1: 56, x2: x, y2: H - 20 });
    return out;
  });
</script>

<svg viewBox="0 0 {W} {H}" class="block h-auto {className || 'w-full'}" aria-hidden="true" focusable="false">
  <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="2" fill="var(--color-paper)" stroke="var(--color-line-strong)" stroke-width="1" />

  {#if page.foldSide}
    <rect x={page.foldSide === "left" ? 0 : W - fold} y="0" width={fold} height={H} fill="currentColor" class="{hl('fold')} opacity-20" />
  {/if}

  {#if model.scanAids}
    <g class={hl("scanAids")} fill="currentColor">
      <!-- Corner markers; the cut corner's marker sits further in. -->
      <rect x={fromOther(8, 6)} y="8" width="6" height="6" />
      <rect x={fromCut(tabTop + 2, 6)} y="8" width="6" height="6" />
      <rect x="8" y={H - 14} width="6" height="6" />
      <rect x={W - 14} y={H - 14} width="6" height="6" />
    </g>
    <line x1={right ? W - tabTop : tabTop} y1="0.5" x2={right ? W - 0.5 : 0.5} y2={tabSide} stroke="currentColor" stroke-width={strong("scanAids")} stroke-dasharray="3 2" class={hl("scanAids")} />
  {/if}

  {#if model.pageCodes}
    <rect x={fromCut(code.from, code.size)} y={code.bottom - code.size} width={code.size} height={code.size} fill="currentColor" class="{hl('pageCodes')} {highlight === 'pageCodes' ? 'opacity-90' : 'opacity-60'}" />
  {/if}

  {#if page.stickerSpot}
    <rect x={fromOther(20, 30)} y="8" width="30" height="30" fill="none" stroke="currentColor" stroke-width={strong("stickers")} stroke-dasharray="2 1.5" class={hl("stickers")} />
  {/if}

  {#if page.role === "cover"}
    {#if model.logo}
      <rect x={fromOther(20, 40)} y="10" width="40" height="9" rx="1" fill="currentColor" class="{hl('logo')} opacity-50" />
    {/if}
    <!-- Title and header line. -->
    <rect x="60" y="26" width="90" height="6" rx="1" fill="var(--color-line-strong)" />
    <rect x="75" y="35" width="60" height="3" rx="1" fill="var(--color-line)" />
    {#if model.qr === "sticker"}
      <rect x="20" y="46" width="35" height="35" fill="none" stroke="currentColor" stroke-width={strong("qr")} stroke-dasharray="2 1.5" class={hl("qr")} />
      {#if model.initials}
        <line x1="27" y1="70" x2="48" y2="70" stroke="currentColor" stroke-width="0.8" class={hl("qr")} />
      {/if}
    {:else if model.qr === "printed"}
      <g class={hl("qr")} fill="currentColor">
        <rect x="24" y="50" width="27" height="27" fill="none" stroke="currentColor" stroke-width="2" />
        <rect x="28" y="54" width="7" height="7" /><rect x="40" y="54" width="7" height="7" /><rect x="28" y="66" width="7" height="7" /><rect x="40" y="66" width="4" height="4" />
      </g>
    {/if}
    {#if model.nameLine}
      <g class={hl("name")}>
        <rect x="62" y="48" width="12" height="4" rx="1" fill="currentColor" />
        <line x1="76" y1="52" x2={W - 20} y2="52" stroke="currentColor" stroke-width={strong("name")} />
      </g>
    {/if}
    {#if model.info}
      {#each lines(64, model.nameLine ? 60 : 50, W - 84, 78, 6) as l, i (i)}
        <rect x={l.x} y={l.y} width={l.w} height="2.5" rx="1" fill="currentColor" class="{hl('info')} opacity-60" />
      {/each}
    {/if}
    <line x1="20" y1="88" x2={W - 20} y2="88" stroke="var(--color-line-strong)" stroke-width="0.8" />
    {#each lines(20, 98, W - 40, 220) as l, i (i)}
      <rect x={l.x} y={l.y} width={l.w} height="3" rx="1" fill="var(--color-line)" />
    {/each}
  {:else if page.role === "exercises"}
    {#each lines(20, 44, W - 40, 150) as l, i (i)}
      <rect x={l.x} y={l.y} width={l.w} height="3" rx="1" fill="var(--color-line)" />
    {/each}
    <!-- A multiple-choice question: four boxes, then the correction hint. -->
    {#each [0, 1, 2, 3] as i (i)}
      <rect x="24" y={162 + i * 10} width="5" height="5" fill="none" stroke="var(--color-line-strong)" stroke-width="0.8" />
      <rect x="33" y={163 + i * 10} width={70 - i * 8} height="3" rx="1" fill="var(--color-line)" />
    {/each}
    {#if model.mcHint}
      <rect x="24" y="204" width="110" height="3" rx="1" fill="currentColor" class="{hl('mcHint')} opacity-70" />
    {/if}
    {#each lines(20, 218, W - 40, H - 30) as l, i (i)}
      <rect x={l.x} y={l.y} width={l.w} height="3" rx="1" fill="var(--color-line)" />
    {/each}
  {:else}
    <!-- An extra page: heading and note, then the writing paper. -->
    <rect x="20" y="34" width="60" height="5" rx="1" fill="currentColor" class="{hl('notes')} opacity-60" />
    <rect x="20" y="42" width="110" height="2.5" rx="1" fill="currentColor" class="{hl('notes')} opacity-40" />
  {/if}

  {#if page.role === "writing"}
    <g class={hl("paper")} stroke="currentColor" stroke-width={highlight === "paper" ? 0.8 : 0.4} opacity="0.6">
      {#each pattern as p, i (i)}
        <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />
      {/each}
    </g>
  {/if}

  <text x={W / 2} y={H - 8} text-anchor="middle" font-size="9" fill="var(--color-muted)">{page.number}</text>
</svg>
