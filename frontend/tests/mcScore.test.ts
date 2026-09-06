import { describe, it, expect } from "vitest";
import {
  computeMcScore,
  applyMcCorrection,
  restoreOriginalDetection,
  confirmDetection,
  setMcSelectedOptions,
  isMcQuestion,
} from "../src/lib/grading/mcScore";
import type { OmrScoreMeta } from "../src/lib/db/schema";

describe("mcScore", () => {
  describe("isMcQuestion", () => {
    it("recognizes mc, sc, and tf correctly", () => {
      expect(isMcQuestion({ questionType: "mc" })).toBe(true);
      expect(isMcQuestion({ questionType: "sc" })).toBe(true);
      expect(isMcQuestion({ questionType: "tf" })).toBe(true);
      expect(isMcQuestion({ questionType: "free_text" })).toBe(false);
      expect(isMcQuestion({})).toBe(false);
    });
  });

  describe("computeMcScore", () => {
    it("scores MC with right-minus-wrong floored at 0", () => {
      // 2 correct: [0, 2]. Penalty 1. MaxPoints 2.
      expect(computeMcScore("mc", [0, 2], [0, 2], 1, 2)).toBe(2);
      expect(computeMcScore("mc", [0], [0, 2], 1, 2)).toBe(1);
      // 1 correct, 1 wrong -> 1 - 1 = 0
      expect(computeMcScore("mc", [0, 1], [0, 2], 1, 2)).toBe(0);
      // 0 correct, 2 wrong -> floored at 0
      expect(computeMcScore("mc", [1, 3], [0, 2], 1, 2)).toBe(0);
    });

    it("scores SC and TF with exact match requirement", () => {
      expect(computeMcScore("sc", [1], [1], 0, 3)).toBe(3);
      expect(computeMcScore("sc", [2], [1], 0, 3)).toBe(0);
      expect(computeMcScore("sc", [1, 2], [1], 0, 3)).toBe(0);

      // With negative penalty on wrong single-choice selection
      expect(computeMcScore("sc", [2], [1], -1, 3)).toBe(-1);
      expect(computeMcScore("sc", [], [1], -1, 3)).toBe(0);
    });
  });

  describe("applyMcCorrection and original preservation", () => {
    it("preserves initial OMR detection when toggling an option", () => {
      const initialOmrMeta: OmrScoreMeta = {
        confidence: "ambiguous",
        source: "omr",
        flaggedOptions: [1],
        detections: {
          pageIndex: 0,
          bubbles: [
            { optionIndex: 0, state: "blank", rect: [10, 10, 20, 20] },
            { optionIndex: 1, state: "marked", rect: [10, 30, 20, 40] },
          ],
        },
      };

      const res = applyMcCorrection(
        "mc",
        [1],
        0, // toggle option 0 on
        [0, 1],
        0,
        2,
        initialOmrMeta
      );

      expect(res.nextSelectedOptions).toEqual([0, 1]);
      expect(res.nextScore).toBe(2);
      expect(res.nextOmrMeta.source).toBe("manual");
      expect(res.nextOmrMeta.confidence).toBe("high");
      expect(res.nextOmrMeta.reviewedAt).toBeDefined();

      // Original detection snapshot must be preserved
      expect(res.nextOmrMeta.original).toBeDefined();
      expect(res.nextOmrMeta.original?.confidence).toBe("ambiguous");
      expect(res.nextOmrMeta.original?.selectedOptions).toEqual([1]);
      expect(res.nextOmrMeta.original?.flaggedOptions).toEqual([1]);

      // Bubble states should be updated in detections
      expect(res.nextOmrMeta.detections?.bubbles[0].state).toBe("marked");
      expect(res.nextOmrMeta.detections?.bubbles[1].state).toBe("marked");
    });

    it("does not overwrite existing original snapshot on subsequent corrections", () => {
      const initialOmrMeta: OmrScoreMeta = {
        confidence: "ambiguous",
        source: "omr",
      };

      // First correction: from [] to [0]
      const step1 = applyMcCorrection("mc", [], 0, [0], 0, 1, initialOmrMeta);
      expect(step1.nextOmrMeta.original?.selectedOptions).toEqual([]);

      // Second correction: from [0] to [0, 1]
      const step2 = applyMcCorrection("mc", step1.nextSelectedOptions, 1, [0], 0, 1, step1.nextOmrMeta);
      // Original should still be the initial [] from step 1!
      expect(step2.nextOmrMeta.original?.selectedOptions).toEqual([]);
    });

    it("handles single choice toggles correctly", () => {
      const res = applyMcCorrection("sc", [0], 1, [1], 0, 1);
      // Changing single-choice selection from 0 to 1 replaces the selection
      expect(res.nextSelectedOptions).toEqual([1]);

      // Toggling the already selected option clears it
      const cleared = applyMcCorrection("sc", [1], 1, [1], 0, 1);
      expect(cleared.nextSelectedOptions).toEqual([]);
    });
  });

  describe("setMcSelectedOptions", () => {
    it("sets options explicitly and preserves original snapshot", () => {
      const initialOmrMeta: OmrScoreMeta = {
        confidence: "high",
        source: "omr",
      };

      const res = setMcSelectedOptions("mc", [2, 0], [0, 2], 0, 2, initialOmrMeta, 0);
      expect(res.nextSelectedOptions).toEqual([0, 2]); // sorted
      expect(res.nextScore).toBe(2);
      expect(res.nextOmrMeta.original?.selectedOptions).toEqual([2, 0]);
      expect(res.nextOmrMeta.source).toBe("manual");
      expect(res.nextOmrMeta.reviewedAt).toBeDefined();
    });
  });

  describe("restoreOriginalDetection", () => {
    it("restores original selections, confidence, and source", () => {
      const modifiedMeta: OmrScoreMeta = {
        confidence: "high",
        source: "manual",
        original: {
          confidence: "ambiguous",
          selectedOptions: [0],
          score: 1,
          flaggedOptions: [0],
        },
        detections: {
          pageIndex: 0,
          bubbles: [
            { optionIndex: 0, state: "blank", rect: [10, 10, 20, 20] },
            { optionIndex: 1, state: "marked", rect: [10, 30, 20, 40] },
          ],
        },
      };

      const res = restoreOriginalDetection("mc", [0], 0, 1, modifiedMeta);
      expect(res).not.toBeNull();
      expect(res?.nextSelectedOptions).toEqual([0]);
      expect(res?.nextScore).toBe(1);
      expect(res?.nextOmrMeta.confidence).toBe("ambiguous");
      expect(res?.nextOmrMeta.source).toBe("omr");
      expect(res?.nextOmrMeta.flaggedOptions).toEqual([0]);
      expect(res?.nextOmrMeta.detections?.bubbles[0].state).toBe("marked");
      expect(res?.nextOmrMeta.detections?.bubbles[1].state).toBe("blank");
    });

    it("returns null if no original snapshot exists", () => {
      const metaWithoutOrig: OmrScoreMeta = {
        confidence: "high",
        source: "omr",
      };
      const res = restoreOriginalDetection("mc", [0], 0, 1, metaWithoutOrig);
      expect(res).toBeNull();
    });
  });

  describe("confirmDetection", () => {
    it("marks detection as reviewed without changing selections", () => {
      const omrMeta: OmrScoreMeta = {
        confidence: "ambiguous",
        source: "omr",
      };

      const res = confirmDetection([0, 1], 2, omrMeta);
      expect(res.nextSelectedOptions).toEqual([0, 1]);
      expect(res.nextScore).toBe(2);
      expect(res.nextOmrMeta.source).toBe("manual");
      expect(res.nextOmrMeta.reviewedAt).toBeDefined();
      expect(res.nextOmrMeta.original?.confidence).toBe("ambiguous");
      expect(res.nextOmrMeta.original?.selectedOptions).toEqual([0, 1]);
    });
  });
});
