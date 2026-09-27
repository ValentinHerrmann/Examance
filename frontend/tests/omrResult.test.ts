import { describe, it, expect } from "vitest";
import { mergeRedetectionIntoVerified } from "../src/lib/grading/omrResult";
import type { ExerciseScoreRecord } from "../src/lib/db/schema";

describe("mergeRedetectionIntoVerified", () => {
  const verified: ExerciseScoreRecord = {
    id: "s1",
    submissionId: "sub",
    exerciseId: "ex",
    score: 2,
    selectedOptions: [0],
    omrMeta: {
      confidence: "ambiguous",
      source: "manual",
      reviewedAt: "2026-09-27T10:00:00.000Z",
      original: { confidence: "ambiguous", selectedOptions: [] },
      donation: { at: "2026-09-27T10:05:00.000Z", label: "0" },
      detections: {
        pageIndex: 0,
        bubbles: [
          { optionIndex: 0, state: "marked", rect: [0, 0, 0.1, 0.1], detectedState: "ambiguous" },
          { optionIndex: 1, state: "blank", rect: [0, 0.2, 0.1, 0.3], detectedState: "blank" },
        ],
      },
    },
  };
  const fresh: ExerciseScoreRecord = {
    id: "s1",
    submissionId: "sub",
    exerciseId: "ex",
    score: 0,
    selectedOptions: [1],
    omrMeta: {
      confidence: "high",
      source: "omr",
      original: { confidence: "high", selectedOptions: [1] },
      detections: {
        pageIndex: 0,
        bubbles: [
          { optionIndex: 0, state: "blank", rect: [0, 0, 0.1, 0.1], detectedState: "blank" },
          { optionIndex: 1, state: "marked", rect: [0, 0.2, 0.1, 0.3], detectedState: "marked" },
        ],
      },
    },
  };

  it("keeps the teacher's decision and replaces only the recorded detection", () => {
    const merged = mergeRedetectionIntoVerified(verified, fresh);
    // verified result untouched
    expect(merged.selectedOptions).toEqual([0]);
    expect(merged.score).toBe(2);
    expect(merged.omrMeta?.source).toBe("manual");
    expect(merged.omrMeta?.reviewedAt).toBe(verified.omrMeta?.reviewedAt);
    expect(merged.omrMeta?.donation).toEqual(verified.omrMeta?.donation);
    // detection refreshed
    expect(merged.omrMeta?.original?.selectedOptions).toEqual([1]);
    expect(merged.omrMeta?.confidence).toBe("high");
    expect(merged.omrMeta?.detections?.bubbles.map((b) => b.detectedState)).toEqual(["blank", "marked"]);
    // display follows the verified selection
    expect(merged.omrMeta?.detections?.bubbles.map((b) => b.state)).toEqual(["marked", "blank"]);
  });
});
