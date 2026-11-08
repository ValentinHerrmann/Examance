import { describe, it, expect } from "vitest";
import { registerPage, transformPoint, pdfPointToExpectedPixel } from "../src/lib/grading/omrRegistration";
import { DEFAULT_OMR_PARAMS } from "../src/lib/grading/omrSettings";
import type { OmrFiducialRect, OmrPageTemplate } from "../src/lib/db/schema";

// Corner markers of Schulaufgabe.sty §6b on an odd A4 page (issue #227): 5 mm solid squares centred where the former 8 mm ring targets were.
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const SCALE = 2;
/** Lower-left corners in mm of the 5 mm markers (0=BL, 1=BR, 2=TR beside the cut zone, 3=TL). */
const NEW_MARKERS: [0 | 1 | 2 | 3, number, number][] = [
  [0, 6.5, 6.5],
  [1, 210 - 11.5, 6.5],
  [2, 210 - 52.5, 297 - 18.5],
  [3, 6.5, 297 - 18.5],
];

function fiducials(size: number): OmrFiducialRect[] {
  const pad = (size - 5) / 2;
  return NEW_MARKERS.map(([corner, x, y]) => ({
    corner,
    rect: [(x - pad) * MM, (y - pad) * MM, (x - pad + size) * MM, (y - pad + size) * MM],
  }));
}

function template(size: number): OmrPageTemplate {
  return { pageIndex: 0, pageWidthPt: PAGE_W, pageHeightPt: PAGE_H, fiducials: fiducials(size), bubbles: [] };
}

class Scan {
  readonly width = Math.round(PAGE_W * SCALE);
  readonly height = Math.round(PAGE_H * SCALE);
  readonly data = new Uint8ClampedArray(this.width * this.height * 4).fill(255);

  /** Fills a rect given in mm from the page's lower-left corner, shifted by (dx, dy) mm on the scan. */
  fill(x: number, y: number, w: number, h: number, value: number, dx = 0, dy = 0): void {
    const x0 = Math.round((x + dx) * MM * SCALE);
    const x1 = Math.round((x + dx + w) * MM * SCALE);
    const y0 = Math.round((297 - (y + dy) - h) * MM * SCALE);
    const y1 = Math.round((297 - (y + dy)) * MM * SCALE);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 4;
        this.data[i] = this.data[i + 1] = this.data[i + 2] = value;
      }
    }
  }

  newMarkers(dx = 0, dy = 0): this {
    for (const [, x, y] of NEW_MARKERS) this.fill(x, y, 5, 5, 0, dx, dy);
    return this;
  }

  /** The former 8 mm target: black square, white ring, black centre. */
  oldMarkers(): this {
    for (const [, x, y] of NEW_MARKERS) {
      this.fill(x - 1.5, y - 1.5, 8, 8, 0);
      this.fill(x + 0.1, y + 0.1, 4.8, 4.8, 255);
      this.fill(x + 1.3, y + 1.3, 2.4, 2.4, 0);
    }
    return this;
  }

  image(): ImageData {
    return { width: this.width, height: this.height, data: this.data, colorSpace: "srgb" } as ImageData;
  }
}

/** Where the homography puts a template point (mm from the lower left), in scan pixels, minus where it should land. */
function errorPx(H: NonNullable<ReturnType<typeof registerPage>["H"]>, xMm: number, yMm: number, dx = 0, dy = 0): number {
  const [tx, ty] = pdfPointToExpectedPixel(xMm * MM, yMm * MM, SCALE, PAGE_H);
  const [sx, sy] = transformPoint(H, tx, ty);
  const [ex, ey] = pdfPointToExpectedPixel((xMm + dx) * MM, (yMm + dy) * MM, SCALE, PAGE_H);
  return Math.hypot(sx - ex, sy - ey);
}

describe("corner marker registration (issue #227)", () => {
  it("finds all four 5 mm solid markers against a 5 mm template", () => {
    const reg = registerPage(new Scan().newMarkers().image(), template(5), SCALE, DEFAULT_OMR_PARAMS);
    expect(reg.fiducialsFound).toBe(4);
    expect(errorPx(reg.H!, 105, 148)).toBeLessThan(1);
  });

  it("follows a shifted scan", () => {
    const reg = registerPage(new Scan().newMarkers(2, -3).image(), template(5), SCALE, DEFAULT_OMR_PARAMS);
    expect(reg.fiducialsFound).toBe(4);
    expect(errorPx(reg.H!, 50, 200, 2, -3)).toBeLessThan(1);
  });

  it("still registers new prints against a template captured with the former 8 mm markers", () => {
    const reg = registerPage(new Scan().newMarkers().image(), template(8), SCALE, DEFAULT_OMR_PARAMS);
    expect(reg.fiducialsFound).toBe(4);
    expect(errorPx(reg.H!, 105, 148)).toBeLessThan(1);
  });

  it("still registers sheets printed with the former 8 mm markers against a 5 mm template", () => {
    const reg = registerPage(new Scan().oldMarkers().image(), template(5), SCALE, DEFAULT_OMR_PARAMS);
    expect(reg.fiducialsFound).toBe(4);
    expect(errorPx(reg.H!, 105, 148)).toBeLessThan(1);
  });

  it("prefers the marker over a marker-sized ink blob near the corner", () => {
    const scan = new Scan().newMarkers();
    scan.fill(20, 20, 5, 5, 0);
    scan.fill(20, 297 - 30, 4, 6, 0);
    const reg = registerPage(scan.image(), template(5), SCALE, DEFAULT_OMR_PARAMS);
    expect(reg.fiducialsFound).toBe(4);
    expect(errorPx(reg.H!, 105, 148)).toBeLessThan(1);
  });
});
