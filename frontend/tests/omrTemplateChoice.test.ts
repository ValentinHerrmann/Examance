import { describe, expect, it } from "vitest";
import { pickByFit, tryOrder } from "#lib/grading/omrTemplateChoice";
import { templateFit } from "#lib/grading/omrShape";

describe("OMR template choice (issue #239)", () => {
  it("takes the first template that fits, else the best fit", () => {
    expect(pickByFit([0.9, 0.95])).toBe(0);
    expect(pickByFit([0.3, 0.85])).toBe(1);
    expect(pickByFit([0.3, 0.5, 0.4])).toBe(1);
    expect(pickByFit([undefined, 0.2])).toBe(1);
    expect(pickByFit([undefined, undefined])).toBe(0);
  });

  it("tries the template that fit before first, then the rest in order", () => {
    const list = [{ hash: "a" }, { hash: "b" }, { hash: "c" }];
    expect(tryOrder(list, "b").map((c) => c.hash)).toEqual(["b", "a", "c"]);
    expect(tryOrder(list, "x").map((c) => c.hash)).toEqual(["a", "b", "c"]);
  });

  it("measures the share of boxes found on their printed border", () => {
    expect(templateFit([])).toBeUndefined();
    expect(templateFit([{ shape: { borderFound: true } }, { shape: { borderFound: false } }, {}])).toBe(0.5);
  });
});
