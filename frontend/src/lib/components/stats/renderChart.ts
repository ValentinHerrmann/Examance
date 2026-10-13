/** Renders a chart off-screen at the fixed export size, so files look the same on any screen width. */
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import ColumnChart from './ColumnChart.svelte';
import { serializeChartSvg } from './chartExport';

const EXPORT_WIDTH = 1200;
const EXPORT_PLOT = 420;

export type ChartSpec = Omit<ComponentProps<typeof ColumnChart>, 'svgEl' | 'plotHeight'>;

/** Serialised SVG document (literal colours) of `chart`; `docTitle` becomes its `<title>`. */
export function renderChartSvg(chart: ChartSpec, docTitle: string): string {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;top:0;left:-10000px;pointer-events:none;width:${EXPORT_WIDTH}px`;
  document.body.appendChild(host);
  const instance = mount(ColumnChart, { target: host, props: { ...chart, plotHeight: EXPORT_PLOT } });
  try {
    flushSync();
    const svg = host.querySelector('svg');
    if (!svg) throw new Error('chartExport: chart did not render');
    return serializeChartSvg(svg, docTitle);
  } finally {
    // Without an outro unmount removes the DOM synchronously; the promise only reports failures.
    unmount(instance).catch(console.error);
    host.remove();
  }
}
