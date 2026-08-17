import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeMcVerificationStats } from "../src/lib/grading/mcVerification";
import { submissionRepository } from "../src/lib/repositories/submissionRepository";
import { studentRepository } from "../src/lib/repositories/studentRepository";
import * as dbEncryption from "../src/lib/db/dbEncryption";
import * as mcExerciseHash from "../src/lib/grading/mcExerciseHash";

vi.mock("../src/lib/repositories/submissionRepository", () => ({
  submissionRepository: {
    getByExamId: vi.fn(),
  },
}));

vi.mock("../src/lib/repositories/studentRepository", () => ({
  studentRepository: {
    getByExamId: vi.fn(),
  },
}));

vi.mock("../src/lib/db/dbEncryption", () => ({
  loadScoresEncrypted: vi.fn(),
}));

vi.mock("../src/lib/grading/mcExerciseHash", () => ({
  loadExamMcExercises: vi.fn(),
}));

describe("computeMcVerificationStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps items at (submission x exercise) granularity for the verification queues", async () => {
    const mockExercises = [
      { id: "ex-1", questionType: "mc", title: "Q1", maxPoints: 2, penalty: 0 },
      { id: "ex-2", questionType: "sc", title: "Q2", maxPoints: 1, penalty: 0 },
      { id: "ex-3", questionType: "tf", title: "Q3", maxPoints: 1, penalty: 0 },
    ] as any[];

    const mockSubmissions = [
      { id: "sub-1", examId: "exam-100", pseudonymHash: "hash-1" },
      { id: "sub-2", examId: "exam-100", pseudonymHash: "hash-2" },
    ] as any[];

    const mockStudents = [] as any[];

    vi.mocked(mcExerciseHash.loadExamMcExercises).mockResolvedValue(mockExercises);
    vi.mocked(submissionRepository.getByExamId).mockResolvedValue(mockSubmissions);
    vi.mocked(studentRepository.getByExamId).mockResolvedValue(mockStudents);

    vi.mocked(dbEncryption.loadScoresEncrypted).mockImplementation(async (subId: string) => {
      if (subId === "sub-1") {
        return [
          // mc: two boxes ticked
          { id: "s1", submissionId: "sub-1", exerciseId: "ex-1", selectedOptions: [0, 2], omrMeta: { confidence: "high", source: "omr" } },
          // sc: one box ticked, also flagged as uncertain
          { id: "s2", submissionId: "sub-1", exerciseId: "ex-2", selectedOptions: [0], omrMeta: { confidence: "ambiguous", source: "omr", flaggedOptions: [0] } },
          // tf: alignment failed — no readable boxes, still 1 detection
          { id: "s3", submissionId: "sub-1", exerciseId: "ex-3", selectedOptions: [], omrMeta: { confidence: "failed", source: "omr" } },
        ] as any[];
      }
      if (subId === "sub-2") {
        return [
          { id: "s4", submissionId: "sub-2", exerciseId: "ex-1", selectedOptions: [1], omrMeta: { confidence: "high", source: "omr" } },
          { id: "s5", submissionId: "sub-2", exerciseId: "ex-2", selectedOptions: [0], omrMeta: { confidence: "high", source: "omr" } },
          { id: "s6", submissionId: "sub-2", exerciseId: "ex-3", selectedOptions: [1], omrMeta: { confidence: "ambiguous", source: "omr", flaggedOptions: [1] } },
        ] as any[];
      }
      return [];
    });

    const stats = await computeMcVerificationStats("exam-100", null);

    // items stay one-per-(submission,exercise) — the queues review a whole question at a time.
    expect(stats.items.length).toBe(6);
    expect(stats.perExercise.length).toBe(3);

    // Headline counts are question-level (one per item), not scaled by how many boxes
    // were ticked on any one question — that's the "multiplies exercises by marks"
    // regression this test guards against.
    expect(stats.totalQuestions).toBe(6);
    expect(stats.highQuestions).toBe(3); // ex-1/sub-1, ex-1/sub-2, ex-2/sub-2
    expect(stats.ambiguousQuestions).toBe(2); // ex-2/sub-1, ex-3/sub-2
    expect(stats.failedQuestions).toBe(1); // ex-3/sub-1

    // Marked-box totals are a separate, informational axis: 2+1+1(failed)+1+1+1 = 7.
    expect(stats.totalMarkedBoxes).toBe(7);
    expect(stats.items.find((i) => i.exerciseId === "ex-1" && i.submissionId === "sub-1")?.markedCount).toBe(2);
    expect(stats.items.find((i) => i.exerciseId === "ex-3" && i.submissionId === "sub-1")?.markedCount).toBe(1);

    const ex1Breakdown = stats.perExercise.find((b) => b.exerciseId === "ex-1");
    expect(ex1Breakdown?.total).toBe(2); // 2 questions (sub-1, sub-2), not 3 marked boxes
    expect(ex1Breakdown?.markedBoxes).toBe(3); // 2 (sub-1) + 1 (sub-2)
  });

  it("dedupes stale duplicate score rows for the same (submission, exercise) pair", async () => {
    const mockExercises = [{ id: "ex-1", questionType: "sc", title: "Q1", maxPoints: 1, penalty: 0 }] as any[];
    const mockSubmissions = [{ id: "sub-1", examId: "exam-100", pseudonymHash: "hash-1" }] as any[];

    vi.mocked(mcExerciseHash.loadExamMcExercises).mockResolvedValue(mockExercises);
    vi.mocked(submissionRepository.getByExamId).mockResolvedValue(mockSubmissions);
    vi.mocked(studentRepository.getByExamId).mockResolvedValue([] as any[]);

    vi.mocked(dbEncryption.loadScoresEncrypted).mockResolvedValue([
      { id: "stale", submissionId: "sub-1", exerciseId: "ex-1", selectedOptions: [0], omrMeta: { confidence: "high", source: "omr" } },
      { id: "fresh", submissionId: "sub-1", exerciseId: "ex-1", selectedOptions: [1], omrMeta: { confidence: "ambiguous", source: "omr", flaggedOptions: [1] } },
    ] as any[]);

    const stats = await computeMcVerificationStats("exam-100", null);

    expect(stats.items.length).toBe(1);
    expect(stats.totalQuestions).toBe(1);
  });
});
