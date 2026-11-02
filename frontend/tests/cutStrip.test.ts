import { describe, expect, it } from "vitest";
import { COVER_DEPTH, CUT_LINE, cutStripTemplate, stripCoverBottom } from "../src/lib/qr/cutStrip";
import { withExamOptions } from "../src/lib/exam/examPreview";
import { DEFAULT_OMR_PARAMS } from "../src/lib/grading/omrSettings";
import { A4 } from "../src/lib/pdf/labelKit";

const SCALE = 2;

/** A white A4 page at SCALE with the band-shifted fiducials drawn in, cropped by `cutPt` from the top (a cut-off strip). */
function page(cutPt = 0, fiducials = true): ImageData {
  const width = Math.round(A4.width * SCALE);
  const fullHeight = Math.round(A4.height * SCALE);
  const top = Math.round(cutPt * SCALE);
  const height = fullHeight - top;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(0, Math.round(y0) - top); y < Math.min(height, Math.round(y1) - top); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
    }
  };
  if (fiducials) {
    for (const { rect } of cutStripTemplate().fiducials) {
      const [x0, y0, x1, y1] = rect.map((v) => v * SCALE);
      const [px0, px1, py0, py1] = [x0, x1, fullHeight - y1, fullHeight - y0];
      const s = px1 - px0;
      paint(px0, py0, px1, py1, 0);
      paint(px0 + 0.2 * s, py0 + 0.2 * s, px0 + 0.8 * s, py0 + 0.8 * s, 255);
      paint(px0 + 0.35 * s, py0 + 0.35 * s, px0 + 0.65 * s, py0 + 0.65 * s, 0);
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("cut strip cover (issue #211)", () => {
  it("covers the band of an uncut, aligned page down to the cover depth", () => {
    const bottom = stripCoverBottom(page(), SCALE, DEFAULT_OMR_PARAMS);
    expect(bottom).not.toBeNull();
    expect(Math.abs(bottom! - COVER_DEPTH * SCALE)).toBeLessThan(4);
  });

  it("covers only the blank rest of the band once the strip is cut off", () => {
    const bottom = stripCoverBottom(page(CUT_LINE), SCALE, DEFAULT_OMR_PARAMS);
    expect(Math.abs(bottom! - (COVER_DEPTH - CUT_LINE) * SCALE)).toBeLessThan(4);
  });

  it("treats an unaligned full-height page as uncut and a shorter one as cut", () => {
    const full = page(0, false);
    expect(stripCoverBottom(full, SCALE, DEFAULT_OMR_PARAMS)).toBe(Math.ceil((COVER_DEPTH / A4.height) * full.height));
    expect(stripCoverBottom(page(CUT_LINE, false), SCALE, DEFAULT_OMR_PARAMS)).toBeNull();
  });
});

describe("withExamOptions", () => {
  it("adds the name line and the cut-strip band", () => {
    expect(withExamOptions("sans,punkte", {})).toBe("sans,punkte");
    expect(withExamOptions("sans,punkte", { nameLine: true, cutStrip: true })).toBe("sans,punkte,namenszeile,schnittstreifen");
  });
});
