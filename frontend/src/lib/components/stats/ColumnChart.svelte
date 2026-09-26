<script lang="ts">
  /**
   * Vertical column chart for the stats page: categories on the horizontal
   * axis, counts on the vertical one. Layers are drawn in order on a shared
   * domain, so a wide backdrop layer and a narrow foreground layer make the
   * merged grade/percentage chart. Every column is labelled; labels rotate
   * when they do not fit their slot.
   */
  import { countAxis } from '$lib/analytics/stats';
  import type { ChartLayer } from './chartColumns';

  export let layers: ChartLayer[];
  /** Domain end: the number of grade slots, or 100 for percentages. */
  export let domain: number;
  export let axisLabel = '';
  export let ariaLabel: string;

  const PLOT = 200;
  const GUTTER = 30;
  const RIGHT = 14;
  const LINE = 13;
  const CHAR = 5.8; // approximate advance of a 10px label character
  const MIN_WIDTH = 300; // narrower containers scale the drawing down instead of clipping it

  let width = 0;
  $: vw = Math.max(width, MIN_WIDTH);
  $: plotW = vw - GUTTER - RIGHT;
  $: px = (d: number) => GUTTER + (d / domain) * plotW;
  $: axis = countAxis(layers.flatMap((l) => l.columns.map((c) => c.count)), 5);
  $: h = (count: number) => (count / axis.max) * PLOT;

  $: axisLayer = layers.find((l) => l.labels === 'axis');
  $: topLayer = layers.find((l) => l.labels === 'top');
  $: narrowest = Math.min(...(axisLayer?.columns ?? []).map((c) => px(c.to) - px(c.from)));
  $: rotate = (axisLayer?.columns ?? []).some((c) => c.lines.some((l) => l.length * CHAR > narrowest - 4));
  // -45° needs ~15px between neighbours for 10px text; tighter slots stand the labels upright.
  $: angle = narrowest < 16 ? -90 : -45;
  $: rotatedLabel = (lines: string[]) => lines.slice(0, 2).join(' ');
  $: longest = Math.max(0, ...(axisLayer?.columns ?? []).map((c) => rotatedLabel(c.lines).length * CHAR));
  $: maxLines = Math.max(0, ...(axisLayer?.columns ?? []).map((c) => c.lines.length));

  $: top = 12 + (topLayer ? 2 * LINE + 6 : 0);
  $: base = top + PLOT;
  $: bottom = (rotate ? 14 + longest * (angle === -90 ? 1 : 0.72) : 6 + maxLines * LINE) + (axisLabel ? LINE + 4 : 0);
  $: height = base + bottom;

  /** A bar path with rounded top corners, anchored flat on the baseline. */
  function bar(x: number, y: number, w: number, hgt: number, round: boolean): string {
    const r = round ? Math.min(3, w / 2, hgt) : 0;
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }
</script>

<div class="w-full min-w-0" bind:clientWidth={width}>
  {#if width > 0}
    <svg {width} height={(height * width) / vw} viewBox="0 0 {vw} {height}" role="img" aria-label={ariaLabel}>
      {#each axis.ticks as tick}
        <line x1={GUTTER} x2={vw - RIGHT} y1={base - h(tick)} y2={base - h(tick)} stroke="var(--color-line)" />
        <text x="0" y={base - h(tick) + 4} font-size="11" fill="var(--color-subtle)">{tick}</text>
      {/each}

      {#each layers as layer}
        {#each layer.columns as c}
          {@const slot = px(c.to) - px(c.from)}
          {@const w = Math.max(2, slot * layer.fill)}
          {@const x = px(c.from) + (slot - w) / 2}
          {@const cx = x + w / 2}
          {@const confirmed = Math.max(h(c.count - c.provisional), c.count === 0 ? 3 : 0)}
          <g opacity={layer.opacity ?? 1}>
            <title>{c.title}</title>
            <path d={bar(x, base - confirmed, w, confirmed, c.provisional === 0)} fill={c.color} />
            {#if c.provisional > 0}
              <path d={bar(x, base - h(c.count), w, h(c.provisional), true)} fill={c.color} opacity="0.45" />
            {/if}
          </g>
          {#if layer.values && c.count > 0}
            <text x={cx} y={base - h(c.count) - 5} text-anchor="middle" font-size="11" fill="var(--color-content)">
              {c.value.length * CHAR * 1.1 > slot ? c.count : c.value}
            </text>
          {/if}
          {#if layer.labels === 'top' && slot >= 14}
            <text x={cx} y="14" text-anchor="middle" font-size="12" font-weight="700" fill="var(--color-content)">{c.lines[0]}</text>
            {#if c.lines[1]}
              <text x={cx} y={14 + LINE} text-anchor="middle" font-size="10" fill="var(--color-subtle)">{c.lines[1]}</text>
            {/if}
          {:else if layer.labels === 'axis'}
            {#if rotate}
              <text
                x={cx + (angle === -90 ? 3.5 : 0)}
                y={base + 8}
                transform="rotate({angle} {cx + (angle === -90 ? 3.5 : 0)} {base + 8})"
                text-anchor="end"
                font-size="10"
                fill="var(--color-muted)">{rotatedLabel(c.lines)}</text
              >
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
      {#if axisLabel}
        <text x={vw - RIGHT} y={height - 4} text-anchor="end" font-size="10" fill="var(--color-subtle)">{axisLabel}</text>
      {/if}
    </svg>
  {/if}
</div>
