import { describe, expect, it } from "vitest";
import { cornerCoverPolygon, cutCornerTemplate, MM, ZONE_SIDE, ZONE_TOP } from "../src/lib/qr/cutCorner";
import { withExamOptions } from "../src/lib/exam/examPreview";
import { DEFAULT_OMR_PARAMS } from "../src/lib/grading/omrSettings";
import { A4 } from "../src/lib/pdf/labelKit";

const SCALE = 2;

/** A white A4 page at SCALE, optionally with the corner-tab fiducials drawn in. */
function page(fiducials: boolean): ImageData {
  const width = Math.round(A4.width * SCALE);
  const height = Math.round(A4.height * SCALE);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
    }
  };
  if (fiducials) {
    for (const { rect } of cutCornerTemplate().fiducials) {
      const [x0, , x1, y1] = rect.map((v) => v * SCALE);
      const [px0, py0, s] = [x0, height - y1, x1 - x0];
      paint(px0, py0, px0 + s, py0 + s, 0);
      paint(px0 + 0.2 * s, py0 + 0.2 * s, px0 + 0.8 * s, py0 + 0.8 * s, 255);
      paint(px0 + 0.35 * s, py0 + 0.35 * s, px0 + 0.65 * s, py0 + 0.65 * s, 0);
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("corner tab cover (issue #211)", () => {
  it("places page 1's fiducials where Schulaufgabe.sty puts them", () => {
    const rects = Object.fromEntries(cutCornerTemplate().fiducials.map(({ corner, rect }) => [corner, rect.map((v) => Math.round((v / MM) * 10) / 10)]));
    // In mm from the bottom-left corner, as page 1's omr://__fid__ links report them: the top pair at one height, the top-right one moved inward.
    expect(rects).toEqual({
      0: [5, 5, 13, 13],
      1: [197, 5, 205, 13],
      2: [156, 277, 164, 285],
      3: [5, 277, 13, 285],
    });
  });

  for (const aligned of [true, false]) {
    it(`covers the reserved corner of ${aligned ? "an aligned" : "an unaligned"} page`, () => {
      const img = page(aligned);
      const polygon = cornerCoverPolygon(img, SCALE, DEFAULT_OMR_PARAMS);
      const xs = polygon.map(([x]) => x);
      const ys = polygon.map(([, y]) => y);
      expect(Math.max(...xs)).toBe(img.width);
      expect(Math.min(...ys)).toBe(0);
      expect(Math.abs(Math.min(...xs) - (A4.width - ZONE_TOP) * SCALE)).toBeLessThan(4);
      expect(Math.abs(Math.max(...ys) - ZONE_SIDE * SCALE)).toBeLessThan(4);
    });
  }
});

describe("withExamOptions", () => {
  it("adds the name line; the corner tab is no option any more", () => {
    expect(withExamOptions("sans,punkte", {})).toBe("sans,punkte");
    expect(withExamOptions("sans,punkte", { nameLine: true })).toBe("sans,punkte,namenszeile");
  });
});
