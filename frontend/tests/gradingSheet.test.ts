import { describe, it, expect, vi } from "vitest";
import { buildGradingSheet } from "../src/lib/grading/gradingSheet";
import type { ExerciseScoreRecord } from "../src/lib/db/schema";

const exercises = [
  { id: "mc", questionType: "mc" },
  { id: "open" },
];

function row(submissionId: string, exerciseId: string, extra: Partial<ExerciseScoreRecord> = {}): ExerciseScoreRecord {
  return { id: `${submissionId}-${exerciseId}`, submissionId, exerciseId, ...extra };
}

describe("buildGradingSheet (issue #85)", () => {
  it("keeps only the submission's own MC detection when foreign rows are mixed in", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const own = row("A", "mc", {
      score: 2,
      selectedOptions: [0, 2],
      omrMeta: { confidence: "high", source: "omr" },
    });
    const foreign = row("B", "mc", {
      score: 0.5,
      selectedOptions: [0, 3],
      omrMeta: { confidence: "ambiguous", source: "omr" },
    });
    for (const rows of [[own, foreign], [foreign, own]]) {
      const sheet = buildGradingSheet("A", rows, exercises, new Set(), {});
      expect(sheet.mcState.mc).toEqual({ selectedOptions: [0, 2], omrMeta: own.omrMeta });
      expect(sheet.scoreInputs.mc).toBe(2);
      expect(sheet.loadedScores.get("mc")).toBe(own);
    }
  });

  it("loads nothing from a sheet that belongs entirely to another submission", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sheet = buildGradingSheet("A", [row("B", "mc", { score: 1, selectedOptions: [1] })], exercises, new Set(), {});
    expect(sheet.mcState).toEqual({});
    expect(sheet.loadedScores.size).toBe(0);
    expect(sheet.scoreInputs).toEqual({ mc: null, open: null });
  });

  it("keeps an OMR-read MC row scored 0", () => {
    const sheet = buildGradingSheet(
      "A",
      [row("A", "mc", { score: 0, selectedOptions: [], omrMeta: { confidence: "high", source: "omr" } })],
      exercises,
      new Set(),
      {}
    );
    expect(sheet.scoreInputs.mc).toBe(0);
  });

  it("treats a legacy 0 without strokes as ungraded, but not with strokes or a manual override", () => {
    const rows = [row("A", "open", { score: 0 })];
    expect(buildGradingSheet("A", rows, exercises, new Set(), {}).scoreInputs.open).toBeNull();
    expect(buildGradingSheet("A", rows, exercises, new Set(["open"]), {}).scoreInputs.open).toBe(0);
    expect(buildGradingSheet("A", rows, exercises, new Set(), { open: true }).scoreInputs.open).toBe(0);
  });
});
