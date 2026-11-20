import { describe, it, expect } from "vitest";
import { buildOmrScoreRecord, mergeRedetectionIntoVerified } from "../src/lib/grading/omrResult";
import type { OmrExerciseResult } from "../src/lib/workers/omrWorker";
import type { OmrPageStats, OmrRunInfo } from "../src/lib/grading/omrSettings";
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

  it("leaves a verified row untouched when the re-run could not read the question", () => {
    const failed: ExerciseScoreRecord = {
      ...fresh,
      score: undefined,
      selectedOptions: [],
      omrMeta: {
        confidence: "failed",
        source: "omr",
        original: { confidence: "failed", selectedOptions: [] },
      },
    };
    expect(mergeRedetectionIntoVerified(verified, failed)).toBe(verified);
  });
});

describe("buildOmrScoreRecord with an unfitting template (issue #298)", () => {
  const reading = (extra: Partial<OmrExerciseResult> = {}): OmrExerciseResult => ({
    exerciseId: "ex",
    pageIndex: 0,
    selectedOptions: [1],
    score: 2,
    confidence: "high",
    flaggedOptions: [],
    bubbles: [],
    ...extra,
  });
  const build = (r: OmrExerciseResult, templateFit?: number, templateFitBoxes = 8) =>
    buildOmrScoreRecord(r, { id: "s", submissionId: "sub", run: {} as OmrRunInfo, pageStats: { templateFit, templateFitBoxes } as OmrPageStats }).omrMeta!;

  it("sends a sure reading of a page that does not fit to review", () => {
    const meta = build(reading(), 0.5);
    expect(meta.confidence).toBe("ambiguous");
    expect(meta.templateMismatch).toBe(true);
    expect(meta.alignmentUncertain).toBeUndefined();
    expect(meta.original?.confidence).toBe("high");
  });

  it("leaves a page with too few boxes to judge the layout alone", () => {
    const meta = build(reading(), 0.5, 3);
    expect(meta.confidence).toBe("high");
    expect(meta.templateMismatch).toBeUndefined();
  });

  it("keeps readings of a fitting page or a page without boxes as they are", () => {
    expect(build(reading(), 0.9).confidence).toBe("high");
    expect(build(reading(), 0.9).templateMismatch).toBeUndefined();
    expect(build(reading()).confidence).toBe("high");
  });

  it("keeps a failed reading failed", () => {
    const meta = build(reading({ confidence: "failed" }), 0.2);
    expect(meta.confidence).toBe("failed");
    expect(meta.templateMismatch).toBeUndefined();
  });
});
