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
  import { onMount } from 'svelte';
  import { countAxis } from '$lib/analytics/stats';
  import type { Caption, ChartColumn, ChartCurve, ChartLayer, ChartMarker, ChartSpan } from './chartColumns';

  export let layers: ChartLayer[];
  /** Domain end: the number of grade slots, or 100 for percentages. */
  export let domain: number;
  export let axisLabel = '';
  export let ariaLabel: string;
  /** The rendered `<svg>`, for export. */
  export let svgEl: SVGSVGElement | null = null;
  /** Plot height in drawing units; exports use a taller plot than the page. */
  export let plotHeight = 200;
  /** Reference lines (mean, median) and shaded spans (± standard deviation), on the domain. */
  export let markers: ChartMarker[] = [];
  export let spans: ChartSpan[] = [];
  /** Reference curve drawn faintly behind the bars (the normal distribution). */
  export let curve: ChartCurve | null = null;

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
  const MARKER_ROW = 22; // below the summary track: room for the mean/median labels
  const MARK_SHADE = 0.28; // darkening of a bar's borderline (+/−) zones
  const MARK_ICON = 3.5; // half the arm length of the +/− icon in those zones
  const MARK_RING = 7.5; // radius of the ring around that icon

  let width = 0;
  let container: HTMLDivElement;
  // Container width via a ResizeObserver (lighter than Svelte 4's `bind:clientWidth`, which
  // injects a hidden iframe per element). Measured synchronously on mount as well, so an
  // offscreen export copy has its drawing by the time the caller's `tick()` resolves.
  onMount(() => {
    const observer = new ResizeObserver(() => (width = container.clientWidth));
    observer.observe(container);
    width = container.clientWidth;
    return () => observer.disconnect();
  });
  $: vw = Math.max(width, MIN_WIDTH);
  $: plotW = vw - GUTTER - RIGHT;
  $: px = (d: number) => GUTTER + (d / domain) * plotW;
  // The curve's peak counts too, so it is never cut off at the top.
  $: axis = countAxis(
    [
      ...layers.flatMap((l) => l.columns.map((c) => c.count)),
      Math.ceil(Math.max(0, ...(curve?.points ?? []).map(([, y]) => y))),
    ],
    5
  );
  $: curvePath = curve?.points.length
    ? 'M' + curve.points.map(([x, y]) => `${px(x).toFixed(1)},${(base - h(y)).toFixed(1)}`).join('L')
    : '';
  $: h = (count: number) => (count / axis.max) * plotHeight;
  // Count values above bars fit under `top` (countAxis adds +1 headroom); grade-bar padding needs its own room.
  // Marker labels and span brackets get their own row above the plot, clear of the bar captions.
  // Summary strip: span label, then the track line the bracket and the marks sit on, then
  // the mark labels. `markerRow` is its total height; the plot starts below it.
  $: trackY = spans.length ? 22 : 8;
  $: markerRow = markers.length || spans.length ? trackY + (markers.length ? MARKER_ROW : 8) : 0;
  $: top = markerRow + 12 + (layers.some((l) => l.band) ? BAND_PAD : 0);
  $: clampX = (d: number) => px(Math.min(domain, Math.max(0, d)));
  // Two labels side by side: the left one ends at its line, the right one starts at its line.
  $: markerLabels = [...markers]
    .sort((a, b) => a.at - b.at)
    .map((m, i, all) => ({
      m,
      // Never centred on the mark: its connector runs down through the label row.
      x: clampX(m.at) + (all.length > 1 && i === 0 ? -6 : 6),
      anchor: all.length > 1 && i === 0 ? 'end' : 'start',
    }));
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

  /** The first (longest) caption option that fits `w`; `null` when not even the shortest does. */
  function fitCaption(options: Caption[], w: number): Caption | null {
    const length = (o: Caption) => o.reduce((n, p) => n + p.text.length, 0);
    return options.find((o) => length(o) * CHAR * 1.1 <= w + 2) ?? null;
  }

  function fitValue(c: ChartColumn, w: number): Caption | null {
    return fitCaption(
      c.valueOptions ?? [[{ text: c.value, dynamic: true }], [{ text: String(c.count), dynamic: true }]],
      w
    );
  }

  // Values that move while grading continues (counts, shares) in the full text colour; static
  // labels (grades, names, ranges) in the muted grey of the axis labels.
  const partFill = (dynamic?: boolean) => (dynamic ? 'var(--color-content)' : 'var(--color-muted)');

  // Geometry helpers that read reactive state (`px`, `h`, the layers) are reactive
  // declarations, not plain functions. Svelte 4 re-evaluates a template expression only when
  // a name it mentions changes, so `{@const { x, w } = box(c, layer)}` with a plain `box`
  // never saw `px` change: on a resize the gridlines followed the new width but the bars and
  // labels stayed where they were, and the chart was cut off or left half-empty.
  $: frontLayer = bandLayer ? layers.find((l) => !l.band) : undefined;

  /**
   * Horizontal box of a column. A bar in front of a band is narrowed where its
   * slot is tight, so `BAND_PAD` still fits beside it inside its grade bar.
   */
  $: box = (c: Pick<ChartColumn, 'from' | 'to'>, layer: ChartLayer): { x: number; w: number } => {
    const slot = px(c.to) - px(c.from);
    const fill =
      layer === frontLayer
        ? Math.max(0.4, Math.min(layer.fill, 1 - (2 * BAND_PAD + BAND_EDGE_GAP) / slot))
        : layer.fill;
    const w = Math.max(2, slot * fill);
    return { x: px(c.from) + (slot - w) / 2, w };
  };

  /**
   * A grade bar hugs the bars in front of it: `BAND_PAD` beyond the outermost
   * ones on each side (as above the count), but never closer than
   * `BAND_EDGE_GAP` to its neighbours.
   */
  $: bandBox = (b: ChartColumn): { x: number; w: number } => {
    const lo = px(b.from) + BAND_EDGE_GAP / 2;
    const hi = px(b.to) - BAND_EDGE_GAP / 2;
    const inside = (frontLayer?.columns ?? []).filter((c) => c.from >= b.from - 1e-9 && c.to <= b.to + 1e-9);
    if (!frontLayer || inside.length === 0) return { x: lo, w: Math.max(2, hi - lo) };
    const first = box(inside.reduce((a, c) => (c.from < a.from ? c : a)), frontLayer);
    const last = box(inside.reduce((a, c) => (c.to > a.to ? c : a)), frontLayer);
    const left = Math.max(lo, first.x - BAND_PAD);
    const right = Math.min(hi, last.x + last.w + BAND_PAD);
    return { x: left, w: Math.max(2, right - left) };
  };

  /** Drawn height of a grade bar: its count plus `BAND_PAD` headroom, or a 3px stub when empty. */
  $: bandHeight = (count: number) => (count > 0 ? h(count) + BAND_PAD : 3);

  /** Whether a foreground value at `cx` would overlap the band caption above it. */
  $: clashesWithBand = (cx: number, count: number): boolean => {
    const band = bandLayer?.columns.find((b) => px(b.from) <= cx && cx <= px(b.to));
    return !!band && Math.abs(bandHeight(band.count) - h(count)) < 15;
  };

  /**
   * Approximate boxes of the captions drawn over the plot (grade-bar captions and counts
   * above bars), mirroring the template's conditions. The mean/median guide lines leave a
   * gap wherever they would cross one.
   */
  $: textBoxes = layers.flatMap((layer) =>
    !layer.values
      ? []
      : layer.columns.flatMap((c) => {
          if (layer.band) {
            const { x: bx, w: bw } = bandBox(c);
            const caption = fitValue(c, bw);
            if (!caption) return [];
            const tw = caption.reduce((n, p) => n + p.text.length, 0) * CHAR * 1.15;
            const y = base - bandHeight(c.count) - 6;
            return [{ l: bx + bw / 2 - tw / 2, r: bx + bw / 2 + tw / 2, t: y - 10, b: y + 3 }];
          }
          const { x, w } = box(c, layer);
          const cx = x + w / 2;
          const value = c.count > 0 && !clashesWithBand(cx, c.count) ? fitValue(c, px(c.to) - px(c.from)) : null;
          if (!value) return [];
          const tw = value.reduce((n, p) => n + p.text.length, 0) * CHAR * 1.1;
          const y = base - h(c.count) - 5;
          return [{ l: cx - tw / 2, r: cx + tw / 2, t: y - 10, b: y + 3 }];
        })
  );

  /** Vertical segments from `y0` to `y1` at `x`, with a gap around every caption box it crosses. */
  $: guideSegments = (x: number, y0: number, y1: number): [number, number][] => {
    const gaps = textBoxes
      .filter((b) => x >= b.l - 3 && x <= b.r + 3)
      .map((b) => [b.t - 3, b.b + 3] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    let from = y0;
    for (const [g0, g1] of gaps) {
      if (g0 > from) out.push([from, Math.min(g0, y1)]);
      from = Math.max(from, g1);
      if (from >= y1) break;
    }
    if (from < y1) out.push([from, y1]);
    return out.filter(([a, b]) => b - a > 2);
  };

  /** A bar path with rounded top corners, anchored flat on the baseline. */
  function bar(x: number, y: number, w: number, hgt: number, round: boolean): string {
    const r = round ? Math.min(3, w / 2, hgt) : 0;
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }
</script>

<div class="w-full min-w-0 overflow-hidden" bind:this={container}>
  {#if width > 0}
    <!-- Sized by CSS, never by a pixel width: a fixed width would become the container's
         min-content size, so the card could no longer shrink and the chart was cut off when
         the window narrowed. -->
    <svg
      bind:this={svgEl}
      class="block h-auto w-full"
      viewBox="0 0 {vw} {height}"
      role="img"
      aria-label={ariaLabel}
    >
      {#each axis.ticks as tick}
        <line x1={GUTTER} x2={vw - RIGHT} y1={base - h(tick)} y2={base - h(tick)} stroke="var(--color-line)" />
        <text x="0" y={base - h(tick) + 4} font-size="11" fill="var(--color-subtle)">{tick}</text>
      {/each}

      <!-- Summary strip above the plot: the spread as a bracket, mean and median as marks on it.
           Nothing is drawn inside the plot, so the bars and their captions stay untouched. -->
      {#each spans as span}
        {@const sx = clampX(Math.min(span.from, span.to))}
        {@const sw = clampX(Math.max(span.from, span.to)) - sx}
        {@const caption = fitCaption(span.captionOptions, sw) ?? span.captionOptions[span.captionOptions.length - 1]}
        <g>
          <title>{span.title}</title>
          <line x1={sx} x2={sx + sw} y1={trackY} y2={trackY} stroke="var(--color-muted)" stroke-width="1.5" />
          {#each [sx, sx + sw] as ex}
            <line x1={ex} x2={ex} y1={trackY - 4} y2={trackY + 4} stroke="var(--color-muted)" stroke-width="1.5" />
          {/each}
          <text x={sx + sw / 2} y={trackY - 8} text-anchor="middle" font-size="11" font-weight="700"
            >{#each caption as part}<tspan fill={partFill(part.dynamic)}>{part.text}</tspan>{/each}</text
          >
        </g>
      {/each}
      {#each markerLabels as { m, x: lx, anchor }}
        {@const mx = clampX(m.at)}
        <g>
          <title>{m.title}</title>
          {#if m.shape === 'diamond'}
            <path
              d="M{mx},{trackY - 5}L{mx + 5},{trackY}L{mx},{trackY + 5}L{mx - 5},{trackY}Z"
              fill="var(--color-surface-raised)"
              stroke="var(--color-content)"
              stroke-width="1.5"
            />
          {:else}
            <path
              d="M{mx - 4.5},{trackY}A4.5,4.5 0 1 0 {mx + 4.5},{trackY}A4.5,4.5 0 1 0 {mx - 4.5},{trackY}Z"
              fill="var(--color-content)"
            />
          {/if}
          <!-- Guide line down to the axis (where the same mark sits again, small). Drawn before
               the layers, so every bar covers it, and broken wherever it would cross a caption. -->
          {#each guideSegments(mx, trackY + 6, base) as [g0, g1]}
            <line x1={mx} x2={mx} y1={g0} y2={g1} stroke="var(--color-muted)" stroke-opacity="0.6" stroke-width="1" stroke-dasharray="2 3" />
          {/each}
          <text x={lx} y={trackY + 17} text-anchor={anchor} font-size="11" font-weight="700"
            >{#each m.caption as part}<tspan fill={partFill(part.dynamic)}>{part.text}</tspan>{/each}</text
          >
        </g>
      {/each}

      {#if curvePath && curve}
        <!-- Behind every bar: a faint reference, not data. -->
        <path d={curvePath} fill="none" stroke="var(--color-content)" stroke-opacity="0.35" stroke-width="1.5">
          <title>{curve.title}</title>
        </path>
      {/if}

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
                {#each [{ y: base - h(c.count), hgt: plusH, plus: true, rule: base - h(c.count) + plusH, round: true }, { y: base - minusH, hgt: minusH, plus: false, rule: base - minusH, round: false }] as zone}
                  {#if zone.hgt > 0}
                    <path d={bar(x, zone.y, w, zone.hgt, zone.round)} fill="#000000" opacity={MARK_SHADE} />
                    {#if zone.rule > base - h(c.count) + 0.5 && zone.rule < base - 0.5}
                      <line x1={x} x2={x + w} y1={zone.rule} y2={zone.rule} stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.85" />
                    {/if}
                    {#if zone.hgt >= 10 && w >= 12}
                      <!-- Drawn as strokes, not a glyph: a text minus reads like a placeholder dash. -->
                      {@const cy = zone.y + zone.hgt / 2}
                      {#if zone.hgt >= 2 * MARK_RING + 3 && w >= 2 * MARK_RING + 4}
                        <!-- Ring as a path of two arcs: the PDF export draws paths, not <circle>. -->
                        <path
                          d="M{cx - MARK_RING},{cy}A{MARK_RING},{MARK_RING} 0 1 0 {cx + MARK_RING},{cy}A{MARK_RING},{MARK_RING} 0 1 0 {cx - MARK_RING},{cy}Z"
                          fill="none"
                          stroke="#ffffff"
                          stroke-width="1.5"
                        />
                      {/if}
                      <line x1={cx - MARK_ICON} x2={cx + MARK_ICON} y1={cy} y2={cy} stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" />
                      {#if zone.plus}
                        <line x1={cx} x2={cx} y1={cy - MARK_ICON} y2={cy + MARK_ICON} stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" />
                      {/if}
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
      {#each markers as m}
        {@const ax = clampX(m.at)}
        <g>
          <title>{m.title}</title>
          {#if m.shape === 'diamond'}
            <path d="M{ax},{base - 4}L{ax + 4},{base}L{ax},{base + 4}L{ax - 4},{base}Z" fill="var(--color-surface-raised)" stroke="var(--color-content)" stroke-width="1.25" />
          {:else}
            <path d="M{ax - 3.5},{base}A3.5,3.5 0 1 0 {ax + 3.5},{base}A3.5,3.5 0 1 0 {ax - 3.5},{base}Z" fill="var(--color-content)" />
          {/if}
        </g>
      {/each}
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
