<script lang="ts">
  /**
   * Vertical column chart for the stats page: categories on the horizontal
   * axis, counts on the vertical one. Layers are drawn in order on a shared
   * domain, so a wide backdrop layer and a narrow foreground layer make the
   * merged grade/percentage chart. Charts read best-left, worst-right —
   * callers are responsible for that ordering, this component just draws.
   *
   * All category labels sit below the plot, never above it (that space is
   * for the count values over the bars): an `'axis'` layer gets one label
   * row directly under the baseline, a `'group'` layer gets a second row
   * below that, bracketing each of its (wider) column slots. When axis
   * labels are rotated and would collide, they are thinned — columns marked
   * `anchor` always keep their label, others are dropped greedily so
   * neighbouring labels stay at least `LABEL_GAP` px apart; every column
   * keeps its bar and tooltip regardless.
   *
   * A layer flagged `band` is drawn as a faint backdrop (tint, cap line at
   * its count, side borders) rather than solid bars. Every colour is a
   * `var(--color-*)` string, so `chartExport.ts` can re-theme the serialised
   * `svgEl` with literal values.
   */
  import { countAxis } from '$lib/analytics/stats';
  import type { ChartColumn, ChartLayer } from './chartColumns';

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
  const top = 12; // count values above bars fit under this: countAxis adds +1 headroom

  let width = 0;
  $: vw = Math.max(width, MIN_WIDTH);
  $: plotW = vw - GUTTER - RIGHT;
  $: px = (d: number) => GUTTER + (d / domain) * plotW;
  $: axis = countAxis(layers.flatMap((l) => l.columns.map((c) => c.count)), 5);
  $: h = (count: number) => (count / axis.max) * plotHeight;
  $: base = top + plotHeight;

  $: axisLayer = layers.find((l) => l.labels === 'axis');
  $: groupLayer = layers.find((l) => l.labels === 'group');
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

  $: groupMaxLines = Math.max(0, ...(groupLayer?.columns ?? []).map((c) => c.lines.length));
  $: axisRowHeight = rotate ? 14 + longest * (angle === -90 ? 1 : 0.72) : 6 + maxLines * LINE;
  $: groupRowHeight = 8 + Math.min(3, groupMaxLines) * LINE + 2;
  // The axis title sits right under the axis row it names, above any group row.
  $: titleRowHeight = axisLabel ? LINE + 4 : 0;
  $: groupTop = base + axisRowHeight + titleRowHeight + 4;
  $: bottom = axisRowHeight + titleRowHeight + (groupLayer ? groupRowHeight : 0);
  $: height = base + bottom;

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
          {@const w = Math.max(2, slot * layer.fill)}
          {@const x = px(c.from) + (slot - w) / 2}
          {@const cx = x + w / 2}
          {@const confirmed = Math.max(h(c.count - c.provisional), c.count === 0 ? 3 : 0)}
          {#if layer.band}
            {@const bh = Math.max(2, h(c.count))}
            <g>
              <title>{c.title}</title>
              <rect {x} y={base - bh} width={w} height={bh} fill={c.color} opacity="0.1" />
              <line x1={x} x2={x} y1={base - bh} y2={base} stroke={c.color} stroke-opacity="0.35" />
              <line x1={x + w} x2={x + w} y1={base - bh} y2={base} stroke={c.color} stroke-opacity="0.35" />
              <line x1={x} x2={x + w} y1={base - bh} y2={base - bh} stroke={c.color} stroke-width="1.5" />
            </g>
          {:else}
            <g opacity={layer.opacity ?? 1}>
              <title>{c.title}</title>
              <path d={bar(x, base - confirmed, w, confirmed, c.provisional === 0)} fill={c.color} />
              {#if c.provisional > 0}
                <path d={bar(x, base - h(c.count), w, h(c.provisional), true)} fill={c.color} opacity="0.45" />
              {/if}
            </g>
          {/if}
          {#if layer.values && c.count > 0 && String(c.count).length * CHAR * 1.1 <= slot + 2}
            <text x={cx} y={base - h(c.count) - 5} text-anchor="middle" font-size="11" fill="var(--color-content)">
              {c.value.length * CHAR * 1.1 > slot ? c.count : c.value}
            </text>
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

      {#if groupLayer}
        {#each groupLayer.columns as c}
          {@const slot = px(c.to) - px(c.from)}
          {@const cx = px(c.from) + slot / 2}
          {@const y0 = groupTop}
          <line
            x1={px(c.from) + 2}
            x2={px(c.to) - 2}
            y1={y0}
            y2={y0}
            stroke={c.color}
            stroke-width="2"
            stroke-linecap="round"
          />
          {#if c.lines[0] && c.lines[0].length * CHAR * 1.2 <= slot - 2}
            <text x={cx} y={y0 + 14} text-anchor="middle" font-size="12" font-weight="700" fill="var(--color-content)"
              >{c.lines[0]}</text
            >
          {/if}
          {#each c.lines.slice(1, 3) as line, li}
            {#if line.length * CHAR <= slot - 2}
              <text
                x={cx}
                y={y0 + 14 + (li + 1) * LINE}
                text-anchor="middle"
                font-size="10"
                fill={li === 0 ? 'var(--color-muted)' : 'var(--color-subtle)'}>{line}</text
              >
            {/if}
          {/each}
        {/each}
      {/if}

      <line x1={GUTTER} x2={vw - RIGHT} y1={base} y2={base} stroke="var(--color-line-strong)" />
      {#if groupLayer}
        <!-- Grade boundaries: a short tick under the axis at every band edge. -->
        {#each groupLayer.columns as c}
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
