/**
 * Chart export as SVG, PDF and PNG. `ColumnChart` paints with
 * `var(--color-*)` tokens, which mean nothing outside the app's stylesheet,
 * so the serialised markup has every token swapped for a literal colour from
 * a light palette (dark text and marks for white pages). No background is
 * drawn: SVG, PDF and PNG all keep a transparent background.
 *
 * The PDF is real vector output: the chart only ever uses `line`, `rect`,
 * `path` and `text` (optionally rotated about its own anchor), and
 * `svgToPdf` redraws exactly that subset with pdf-lib, which the app already
 * bundles. A new element type in `ColumnChart` must be added there too —
 * unknown elements throw rather than silently vanishing from the PDF.
 */

/** Token name (without `--color-`) → literal colour. */
export type ChartPalette = Record<string, string>;

// Grades 2–5 darkened from the app's on-screen shades so every mark keeps at
// least 3:1 contrast on white.
export const CHART_PALETTE: ChartPalette = {
  line: '#cbd5e1',
  'line-strong': '#94a3b8',
  content: '#0f172a',
  muted: '#475569',
  subtle: '#64748b',
  'grade-1': '#15803d',
  'grade-2': '#16a34a',
  'grade-3': '#ca8a04',
  'grade-4': '#ea580c',
  'grade-5': '#dc2626',
  'grade-6': '#b91c1c',
};

/** PNG target: the largest size that fits a Full HD screen. */
export const PNG_FIT = { width: 1920, height: 1080 };

const FONT_STACK = "Helvetica, Arial, 'Segoe UI', system-ui, sans-serif";
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Replace every `var(--color-x)` with its palette value. Throws on a token the
 * palette does not know, so a new chart colour cannot leak an unresolvable
 * `var()` into an exported file.
 */
export function applyPalette(markup: string, palette: ChartPalette = CHART_PALETTE): string {
  return markup.replace(/var\(--color-([\w-]+)\)/g, (_, token: string) => {
    const value = palette[token];
    if (!value) throw new Error(`chartExport: no colour for token --color-${token}`);
    return value;
  });
}

/** Drawing size from the viewBox. */
function viewBoxSize(svg: Element): { width: number; height: number } {
  const [, , w, h] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) throw new Error('chartExport: chart has no viewBox');
  return { width: w, height: h };
}

/** A self-contained, transparent SVG document of `svg` with literal colours. */
export function serializeChartSvg(svg: SVGSVGElement, title: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = viewBoxSize(clone);
  clone.setAttribute('xmlns', SVG_NS);
  clone.removeAttribute('role');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('font-family', FONT_STACK);
  const titleEl = document.createElementNS(SVG_NS, 'title');
  titleEl.textContent = title;
  clone.insertBefore(titleEl, clone.firstChild);
  const markup = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${applyPalette(markup)}`;
}

/** Rasterise a serialised chart to a transparent PNG that fits `PNG_FIT`. */
export async function svgToPng(markup: string): Promise<Blob> {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const { width, height } = viewBoxSize(doc.documentElement);
  const scale = Math.min(PNG_FIT.width / width, PNG_FIT.height / height);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('chartExport: no 2D canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('chartExport: PNG encoding failed'))), 'image/png')
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`chartExport: unsupported colour ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Redraw a serialised chart as a one-page vector PDF (1 SVG unit = 1 pt). */
export async function svgToPdf(markup: string, title: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, LineCapStyle, rgb, degrees } = await import('pdf-lib');
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  const { width: W, height: H } = viewBoxSize(root);

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('Examance');
  const page = pdf.addPage([W, H]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const num = (el: Element, name: string, fallback = 0) => {
    const v = el.getAttribute(name);
    return v === null || v === '' ? fallback : Number(v);
  };
  const color = (value: string | null) => {
    if (!value || value === 'none') return undefined;
    const [r, g, b] = hexToRgb01(value);
    return rgb(r, g, b);
  };

  const walk = (el: Element, groupOpacity: number) => {
    const opacity = groupOpacity * num(el, 'opacity', 1);
    switch (el.tagName) {
      case 'svg':
      case 'g':
        for (const child of Array.from(el.children)) walk(child, opacity);
        return;
      case 'title':
      case 'desc':
        return;
      case 'line': {
        const stroke = color(el.getAttribute('stroke'));
        if (!stroke) return;
        page.drawLine({
          start: { x: num(el, 'x1'), y: H - num(el, 'y1') },
          end: { x: num(el, 'x2'), y: H - num(el, 'y2') },
          thickness: num(el, 'stroke-width', 1),
          color: stroke,
          opacity: opacity * num(el, 'stroke-opacity', 1),
          lineCap: el.getAttribute('stroke-linecap') === 'round' ? LineCapStyle.Round : LineCapStyle.Butt,
        });
        return;
      }
      case 'rect': {
        const h = num(el, 'height');
        page.drawRectangle({
          x: num(el, 'x'),
          y: H - num(el, 'y') - h,
          width: num(el, 'width'),
          height: h,
          color: color(el.getAttribute('fill')),
          opacity: opacity * num(el, 'fill-opacity', 1),
        });
        return;
      }
      case 'path': {
        // drawSvgPath flips the y axis itself around the given origin.
        const stroke = color(el.getAttribute('stroke'));
        page.drawSvgPath(el.getAttribute('d') ?? '', {
          x: 0,
          y: H,
          color: color(el.getAttribute('fill')),
          opacity: opacity * num(el, 'fill-opacity', 1),
          ...(stroke && {
            borderColor: stroke,
            borderWidth: num(el, 'stroke-width', 1),
            borderOpacity: opacity * num(el, 'stroke-opacity', 1),
          }),
        });
        return;
      }
      case 'text': {
        // A caption may be split into <tspan> runs of different colours (static vs. dynamic
        // values); draw them one after another along the baseline.
        const tspans = Array.from(el.children).filter((c) => c.tagName === 'tspan');
        const runs = (tspans.length ? tspans : [el]).map((r) => ({
          // Standard fonts are WinAnsi: map the narrow no-break space Intl uses to a plain one.
          text: (r.textContent ?? '').replace(/\u202f/g, '\u00a0'),
          fill: r.getAttribute('fill') ?? el.getAttribute('fill'),
        }));
        if (!runs.some((r) => r.text.trim())) return;
        const size = num(el, 'font-size', 10);
        const font = num(el, 'font-weight', 400) >= 600 ? bold : regular;
        const widths = runs.map((r) => font.widthOfTextAtSize(r.text, size));
        const total = widths.reduce((a, b) => a + b, 0);
        const shift = { start: 0, middle: 0.5, end: 1 }[el.getAttribute('text-anchor') ?? 'start'] ?? 0;
        // The chart only rotates labels about their own anchor point.
        const rot = /rotate\(\s*(-?[\d.]+)/.exec(el.getAttribute('transform') ?? '');
        const angle = rot ? -Number(rot[1]) : 0; // SVG is y-down, PDF y-up
        const cos = Math.cos((angle * Math.PI) / 180);
        const sin = Math.sin((angle * Math.PI) / 180);
        let offset = -shift * total;
        runs.forEach((r, k) => {
          page.drawText(r.text, {
            x: num(el, 'x') + offset * cos,
            y: H - num(el, 'y') + offset * sin,
            size,
            font,
            color: color(r.fill) ?? rgb(0, 0, 0),
            opacity,
            rotate: degrees(angle),
          });
          offset += widths[k];
        });
        return;
      }
      default:
        throw new Error(`chartExport: <${el.tagName}> is not supported in PDF export`);
    }
  };
  walk(root, 1);

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Hand a file to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
