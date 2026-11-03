import { describe, expect, it } from "vitest";
import { withExamOptions } from "../src/lib/exam/examPreview";

describe("withExamOptions", () => {
  it("adds the name line; the corner tab is no option any more", () => {
    expect(withExamOptions("sans,punkte", {})).toBe("sans,punkte");
    expect(withExamOptions("sans,punkte", { nameLine: true })).toBe("sans,punkte,namenszeile");
  });
});
