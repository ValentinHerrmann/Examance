<script lang="ts">
  /**
   * Vertical column chart for the stats page: categories on the horizontal
   * axis, counts on the vertical one. Layers are drawn in order on a shared
   * domain, so a wide backdrop layer and a narrow foreground layer make the
   * merged grade/percentage chart. Charts read best-left, worst-right —
   * callers are responsible for that ordering, this component just draws.
   *
   * All category labels sit below the plot, never above it (that space is
   * for the count values over the bars): the `'axis'` layer gets one label
   * row directly under the baseline. When axis
   * labels are rotated and would collide, they are thinned — columns marked
   * `anchor` always keep their label, others are dropped greedily so
   * neighbouring labels stay at least `LABEL_GAP` px apart; every column
   * keeps its bar and tooltip regardless.
   *
   * A layer flagged `band` is drawn as wide, translucent, unframed bars
   * behind the other layers (the merged chart's grades), each a few px taller
   * than its count so a percent bar holding the whole grade still ends below
   * it. The bars in front cast a soft shadow onto them. The band's caption
   * goes above each bar, and a foreground value that would collide with it
   * is dropped (the tooltip still has it). Every colour is a
   * `var(--color-*)` string, so `chartExport.ts` can re-theme the serialised
   * `svgEl` with literal values.
   */
  import { countAxis } from '$lib/analytics/stats';
  import type { Caption, ChartColumn, ChartLayer } from './chartColumns';

  export let layers: ChartLayer[];
  /** Domain end: the number of grade slots, or 100 for percentages. */
  export let domain: number;
  export let axisLabel = '';
  export let ariaLabel: string;
  /** The rendered `<svg>`, for export. */
  export let svgEl: SVGSVGElement | null = null;
  /** Plot height in drawing units; exports use a taller plot than the page. */
  export let plotHeight = 200;

  const GUTTER = 30;
  const RIGHT = 14;
  const LINE = 13;
  const CHAR = 5.8; // approximate advance of a 10px label character
  const MIN_WIDTH = 300; // narrower containers scale the drawing down instead of clipping it
  const LABEL_GAP = 12; // min px between centres of rotated 10px labels
  // Band layer look (settled by side-by-side review on the stats page).
  const BAND_FILL = 0.62;
  // Dark grades get a lighter band, or their percent bars in front barely stand out.
  const BAND_FILL_BY_COLOR: Record<string, number> = {
    'var(--color-grade-1)': 0.45,
    'var(--color-grade-6)': 0.32,
  };
  const BAND_EDGE_GAP = 2; // min px between neighbouring grade bars
  const BAND_PAD = 4; // room around the bars in front: above the count, and left/right of the outermost bars
  const SHADOW = 2; // px depth of the shadow foreground bars cast onto the band
  const SHADOW_OPACITY = 0.1; // per stacked shadow layer
  const MARK_SHADE = 0.28; // darkening of a bar's borderline (+/−) zones

  let width = 0;
  $: vw = Math.max(width, MIN_WIDTH);
  $: plotW = vw - GUTTER - RIGHT;
  $: px = (d: number) => GUTTER + (d / domain) * plotW;
  $: axis = countAxis(layers.flatMap((l) => l.columns.map((c) => c.count)), 5);
  $: h = (count: number) => (count / axis.max) * plotHeight;
  // Count values above bars fit under `top` (countAxis adds +1 headroom); grade-bar padding needs its own room.
  $: top = 12 + (layers.some((l) => l.band) ? BAND_PAD : 0);
  $: base = top + plotHeight;

  $: axisLayer = layers.find((l) => l.labels === 'axis');
  $: bandLayer = layers.find((l) => l.band);
  $: axisCols = axisLayer?.columns ?? [];
  $: axisCx = axisCols.map((c) => px(c.from) + (px(c.to) - px(c.from)) / 2);
  $: narrowest = Math.min(...axisCols.map((c) => px(c.to) - px(c.from)));
  $: rotate = axisCols.some((c) => c.lines.some((l) => l.length * CHAR > narrowest - 4));
  // -45° needs ~15px between neighbours for 10px text; tighter slots stand the labels upright.
  $: angle = narrowest < 16 ? -90 : -45;
  $: rotatedLabel = (lines: string[]) => lines.slice(0, 2).join(' ');
  $: longest = Math.max(0, ...axisCols.map((c) => rotatedLabel(c.lines).length * CHAR));
  $: maxLines = Math.max(0, ...axisCols.map((c) => c.lines.length));

  /** Greedy left-to-right thinning: anchors always in, others only if far enough from their neighbours. */
  function thin(columns: ChartColumn[], centers: number[]): Set<number> {
    const n = columns.length;
    const nextAnchorCx: number[] = new Array(n).fill(Infinity);
    let nextA = Infinity;
    for (let i = n - 1; i >= 0; i--) {
      nextAnchorCx[i] = nextA;
      if (columns[i].anchor) nextA = centers[i];
    }
    const labelled = new Set<number>();
    let prevCx = -Infinity;
    for (let i = 0; i < n; i++) {
      const cx = centers[i];
      if (columns[i].anchor) {
        labelled.add(i);
        prevCx = cx;
        continue;
      }
      if (cx - prevCx >= LABEL_GAP && nextAnchorCx[i] - cx >= LABEL_GAP) {
        labelled.add(i);
        prevCx = cx;
      }
    }
    return labelled;
  }

  $: thinning = rotate && narrowest < LABEL_GAP;
  $: labelSet = thinning ? thin(axisCols, axisCx) : null;

  $: axisRowHeight = rotate ? 14 + longest * (angle === -90 ? 1 : 0.72) : 6 + maxLines * LINE;
  $: bottom = axisRowHeight + (axisLabel ? LINE + 4 : 0);
  $: height = base + bottom;

  /** The longest caption option that fits `w`; `null` when not even the shortest does. */
  function fitValue(c: ChartColumn, w: number): Caption | null {
    const options: Caption[] = c.valueOptions ?? [
      [{ text: c.value, dynamic: true }],
      [{ text: String(c.count), dynamic: true }],
    ];
    const length = (o: Caption) => o.reduce((n, p) => n + p.text.length, 0);
    return options.find((o) => length(o) * CHAR * 1.1 <= w + 2) ?? null;
  }

  // Values that move while grading continues (counts, shares) in the full text colour; static
  // labels (grades, names, ranges) in the muted grey of the axis labels.
  const partFill = (dynamic?: boolean) => (dynamic ? 'var(--color-content)' : 'var(--color-muted)');

  /** Drawn height of a grade bar: its count plus `bandPad` headroom, or a 3px stub when empty. */
  $: frontLayer = bandLayer ? layers.find((l) => !l.band) : undefined;

  /**
   * Horizontal box of a column. A bar in front of a band is narrowed where its
   * slot is tight, so `BAND_PAD` still fits beside it inside its grade bar.
   */
  function box(c: ChartColumn, layer: ChartLayer): { x: number; w: number } {
    const slot = px(c.to) - px(c.from);
    const fill =
      layer === frontLayer
        ? Math.max(0.4, Math.min(layer.fill, 1 - (2 * BAND_PAD + BAND_EDGE_GAP) / slot))
        : layer.fill;
    const w = Math.max(2, slot * fill);
    return { x: px(c.from) + (slot - w) / 2, w };
  }

  /**
   * A grade bar hugs the bars in front of it: `BAND_PAD` beyond the outermost
   * ones on each side (as above the count), but never closer than
   * `BAND_EDGE_GAP` to its neighbours.
   */
  function bandBox(b: ChartColumn): { x: number; w: number } {
    const lo = px(b.from) + BAND_EDGE_GAP / 2;
    const hi = px(b.to) - BAND_EDGE_GAP / 2;
    const inside = (frontLayer?.columns ?? []).filter((c) => c.from >= b.from - 1e-9 && c.to <= b.to + 1e-9);
    if (!frontLayer || inside.length === 0) return { x: lo, w: Math.max(2, hi - lo) };
    const first = box(inside.reduce((a, c) => (c.from < a.from ? c : a)), frontLayer);
    const last = box(inside.reduce((a, c) => (c.to > a.to ? c : a)), frontLayer);
    const left = Math.max(lo, first.x - BAND_PAD);
    const right = Math.min(hi, last.x + last.w + BAND_PAD);
    return { x: left, w: Math.max(2, right - left) };
  }

  $: bandHeight = (count: number) => (count > 0 ? h(count) + BAND_PAD : 3);

  /** Whether a foreground value at `cx` would overlap the band caption above it. */
  function clashesWithBand(cx: number, count: number): boolean {
    const band = bandLayer?.columns.find((b) => px(b.from) <= cx && cx <= px(b.to));
    return !!band && Math.abs(bandHeight(band.count) - h(count)) < 15;
  }

  /** A bar path with rounded top corners, anchored flat on the baseline. */
  function bar(x: number, y: number, w: number, hgt: number, round: boolean): string {
    const r = round ? Math.min(3, w / 2, hgt) : 0;
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }
</script>

<div class="w-full min-w-0" bind:clientWidth={width}>
  {#if width > 0}
    <svg
      bind:this={svgEl}
      {width}
      height={(height * width) / vw}
      viewBox="0 0 {vw} {height}"
      role="img"
      aria-label={ariaLabel}
    >
      {#each axis.ticks as tick}
        <line x1={GUTTER} x2={vw - RIGHT} y1={base - h(tick)} y2={base - h(tick)} stroke="var(--color-line)" />
        <text x="0" y={base - h(tick) + 4} font-size="11" fill="var(--color-subtle)">{tick}</text>
      {/each}

      {#each layers as layer}
        {#each layer.columns as c, i}
          {@const slot = px(c.to) - px(c.from)}
          {@const front = !!bandLayer && !layer.band}
          {@const { x, w } = box(c, layer)}
          {@const cx = x + w / 2}
          {@const confirmed = Math.max(h(c.count - c.provisional), c.count === 0 ? 3 : 0)}
          {#if layer.band}
            {@const { x: bx, w: bw } = bandBox(c)}
            {@const bh = bandHeight(c.count)}
            {@const caption = fitValue(c, bw)}
            <g>
              <title>{c.title}</title>
              {#if c.count > 0}
                <path
                  d={bar(bx, base - bh, bw, bh, true)}
                  fill={c.color}
                  fill-opacity={BAND_FILL_BY_COLOR[c.color] ?? BAND_FILL}
                />
              {:else}
                <path d={bar(bx, base - bh, bw, bh, false)} fill={c.color} />
              {/if}
            </g>
            {#if layer.values && caption}
              <text
                x={bx + bw / 2}
                y={base - bh - 6}
                text-anchor="middle"
                font-size="11"
                font-weight="700"
                >{#each caption as part}<tspan fill={partFill(part.dynamic)}>{part.text}</tspan>{/each}</text
              >
            {/if}
          {:else}
            {@const fill = c.color}
            {#if front && c.count > 0}
              <!-- Soft cast shadow: offset copies, each a step further right and down. -->
              <g pointer-events="none">
                {#each Array.from({ length: SHADOW }, (_, k) => k + 1) as k}
                  <path
                    d={bar(x + k, base - h(c.count) + k, w, Math.max(0, h(c.count) - k), true)}
                    fill="#000000"
                    opacity={SHADOW_OPACITY}
                  />
                {/each}
              </g>
            {/if}
            <g opacity={layer.opacity ?? 1}>
              <title>{c.title}</title>
              <path d={bar(x, base - confirmed, w, confirmed, c.provisional === 0)} {fill} />
              {#if c.provisional > 0}
                <!-- Provisional share: the grade colour lightened with a white wash rather than made
                     translucent, so it keeps its hue over the grade bars and never reads darker than
                     a confirmed bar (or an empty one) of the same grade. -->
                <path d={bar(x, base - h(c.count), w, h(c.provisional), true)} {fill} />
                <path d={bar(x, base - h(c.count), w, h(c.provisional), true)} fill="#ffffff" opacity="0.4" />
              {/if}
              {#if c.marks && c.count > 0}
                <!-- Borderline zones: '+' (just short of the better grade) darkened at the top of the
                     bar, '−' (just above the worse grade) at its foot, each set off by a white rule. -->
                {@const plusH = h(Math.min(c.marks.plus, c.count))}
                {@const minusH = Math.min(h(c.marks.minus), h(c.count) - plusH)}
                {#each [{ y: base - h(c.count), hgt: plusH, text: `+${c.marks.plus}`, rule: base - h(c.count) + plusH, round: true }, { y: base - minusH, hgt: minusH, text: `−${c.marks.minus}`, rule: base - minusH, round: false }] as zone}
                  {#if zone.hgt > 0}
                    <path d={bar(x, zone.y, w, zone.hgt, zone.round)} fill="#000000" opacity={MARK_SHADE} />
                    {#if zone.rule > base - h(c.count) + 0.5 && zone.rule < base - 0.5}
                      <line x1={x} x2={x + w} y1={zone.rule} y2={zone.rule} stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.85" />
                    {/if}
                    {#if zone.hgt >= 12}
                      <text x={cx} y={zone.y + zone.hgt / 2 + 4} text-anchor="middle" font-size="11" font-weight="700" fill="#ffffff">{zone.text}</text>
                    {/if}
                  {/if}
                {/each}
              {/if}
            </g>
          {/if}
          {#if !layer.band && layer.values && c.count > 0 && !clashesWithBand(cx, c.count)}
            {@const value = fitValue(c, slot)}
            {#if value}
              <text
                x={cx}
                y={base - h(c.count) - 5}
                text-anchor="middle"
                font-size="11"
                >{#each value as part}<tspan fill={partFill(part.dynamic)}>{part.text}</tspan>{/each}</text
              >
            {/if}
          {/if}
          {#if layer.labels === 'axis'}
            {#if rotate}
              {#if !thinning || labelSet?.has(i)}
                <text
                  x={cx + (angle === -90 ? 3.5 : 0)}
                  y={base + 8}
                  transform="rotate({angle} {cx + (angle === -90 ? 3.5 : 0)} {base + 8})"
                  text-anchor="end"
                  font-size="10"
                  fill="var(--color-muted)">{rotatedLabel(c.lines)}</text
                >
              {/if}
            {:else}
              {#each c.lines as line, li}
                <text
                  x={cx}
                  y={base + 14 + li * LINE}
                  text-anchor="middle"
                  font-size={li === 0 && c.lines.length > 1 ? 11 : 10}
                  font-weight={li === 0 && c.lines.length > 1 ? 700 : 400}
                  fill={li === 0 ? 'var(--color-muted)' : 'var(--color-subtle)'}>{line}</text
                >
              {/each}
            {/if}
          {/if}
        {/each}
      {/each}

      <line x1={GUTTER} x2={vw - RIGHT} y1={base} y2={base} stroke="var(--color-line-strong)" />
      {#if bandLayer}
        <!-- Grade boundaries: a short tick under the axis at every band edge. -->
        {#each bandLayer.columns as c}
          {#each [px(c.from), px(c.to)] as tx}
            <line x1={tx} x2={tx} y1={base} y2={base + 4} stroke="var(--color-line-strong)" />
          {/each}
        {/each}
      {/if}
      {#if axisLabel}
        <text
          x={vw - RIGHT}
          y={base + axisRowHeight + LINE}
          text-anchor="end"
          font-size="10"
          fill="var(--color-subtle)">{axisLabel}</text
        >
      {/if}
    </svg>
  {/if}
</div>
