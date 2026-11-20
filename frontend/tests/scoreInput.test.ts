import { describe, expect, it } from "vitest";
import { pastedScore, scoreToWrite } from "../src/lib/grading/scoreInput";

describe("scoreToWrite (issue #299)", () => {
  it("clears the score for a blank field", () => {
    expect(scoreToWrite("", 5)).toEqual({ write: null });
    expect(scoreToWrite("  ", 5)).toEqual({ write: null });
    expect(scoreToWrite(undefined, 5)).toEqual({ write: null });
  });

  it("writes a typed number within the range", () => {
    expect(scoreToWrite("5,5", 6)).toEqual({ write: 5.5 });
    expect(scoreToWrite("0", 6)).toEqual({ write: 0 });
  });

  // Regression: invalid text was read as blank and deleted the stored score.
  it("writes nothing for invalid or out-of-range text", () => {
    expect(scoreToWrite("5abc", 6)).toBeNull();
    expect(scoreToWrite("abc", 6)).toBeNull();
    expect(scoreToWrite("7", 6)).toBeNull();
    expect(scoreToWrite("-1", 6)).toBeNull();
  });
});

describe("pastedScore (issue #299)", () => {
  it("keeps empty, valid and invalid cells apart", () => {
    expect(pastedScore("")).toBeNull();
    expect(pastedScore(" 2,5 ")).toBe(2.5);
    expect(pastedScore("5abc")).toBeNaN();
  });
});
