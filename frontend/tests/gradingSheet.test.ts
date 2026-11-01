import { describe, it, expect, vi } from "vitest";
import { buildGradingSheet } from "../src/lib/grading/gradingSheet";
import type { ExerciseScoreRecord } from "../src/lib/db/schema";
import type { VectorStroke } from "../src/lib/grading/gradingStore";

const exercises = [
  { id: "mc", questionType: "mc", maxPoints: 1 },
  { id: "open", maxPoints: 4 },
];
const pen = (exerciseId: string): VectorStroke => ({ tool: "pen", points: [], color: "#000", exerciseId });

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
      const sheet = buildGradingSheet("A", rows, exercises, []);
      expect(sheet.mcState.mc).toEqual({ selectedOptions: [0, 2], omrMeta: own.omrMeta });
      expect(sheet.scoreInputs.mc).toBe(2);
      expect(sheet.loadedScores.get("mc")).toBe(own);
    }
  });

  it("loads nothing from a sheet that belongs entirely to another submission", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sheet = buildGradingSheet("A", [row("B", "mc", { score: 1, selectedOptions: [1] })], exercises, []);
    expect(sheet.mcState).toEqual({});
    expect(sheet.loadedScores.size).toBe(0);
    expect(sheet.scoreInputs).toEqual({ mc: null, open: null });
  });

  it("keeps an OMR-read MC row scored 0", () => {
    const sheet = buildGradingSheet(
      "A",
      [row("A", "mc", { score: 0, selectedOptions: [], omrMeta: { confidence: "high", source: "omr" } })],
      exercises,
      []
    );
    expect(sheet.scoreInputs.mc).toBe(0);
  });

  it("treats a legacy 0 without strokes as ungraded, but not with strokes", () => {
    const rows = [row("A", "open", { score: 0 })];
    expect(buildGradingSheet("A", rows, exercises, []).scoreInputs.open).toBeNull();
    expect(buildGradingSheet("A", rows, exercises, [pen("open")]).scoreInputs.open).toBe(0);
  });

  describe("part scores (issue #187)", () => {
    const body = String.raw`\begin{Teilaufgabe}{A}\BE\BE\end{Teilaufgabe}
\begin{Teilaufgabe}{B}\BE\BE\BE\end{Teilaufgabe}`;
    const parted = [{ id: "p", maxPoints: 5, latexBody: body }];
    const stamp = (partLabel?: string): VectorStroke => ({ tool: "check_full", points: [], color: "#f00", exerciseId: "p", partLabel });

    it("leaves the exercise ungraded while a part is missing", () => {
      const sheet = buildGradingSheet("A", [row("A", "p", { partScores: { a: 2 } })], parted, []);
      expect(sheet.partInputs.p).toEqual({ a: 2 });
      expect(sheet.scoreInputs.p).toBeNull();
    });

    it("drops a part the exercise no longer has", () => {
      const sheet = buildGradingSheet("A", [row("A", "p", { score: 4, partScores: { a: 1, b: 1, c: 2 } })], parted, []);
      expect(sheet.partInputs.p).toEqual({ a: 1, b: 1 });
      expect(sheet.scoreInputs.p).toBe(2);
    });

    it("marks typed parts as manual on reopen, so stamps do not overwrite them", () => {
      const sheet = buildGradingSheet("A", [row("A", "p", { score: 2.5, partScores: { a: 1.5, b: 1 } })], parted, [stamp("b")]);
      expect(sheet.manualOverride).toEqual({ "p#a": true });
    });

    it("marks a typed total without stamps as manual", () => {
      expect(buildGradingSheet("A", [row("A", "open", { score: 3 })], exercises, [pen("mc")]).manualOverride).toEqual({ open: true });
    });
  });
});
