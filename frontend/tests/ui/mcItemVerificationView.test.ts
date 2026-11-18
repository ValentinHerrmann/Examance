// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import type { ExerciseScoreRecord } from "../../src/lib/db/schema";
import type { McVerificationStats } from "../../src/lib/grading/mcVerification";

const rowOf = (submissionId: string): ExerciseScoreRecord => ({
  id: `row-${submissionId}`,
  submissionId,
  exerciseId: "ex",
  score: 1,
  selectedOptions: [0],
  omrMeta: { confidence: "high", source: "omr" },
});

let releaseSave: () => void = () => {};

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("../../src/lib/components/verify/McItemVerificationCard.svelte", async () => import("./stubs/PropsProbe.svelte"));
vi.mock("../../src/lib/grading/mcExerciseHash", () => ({ loadExamMcExercises: vi.fn(async () => [{ id: "ex", title: "MC" }]) }));
vi.mock("../../src/lib/repositories/submissionRepository", () => ({
  submissionRepository: { getById: vi.fn(async (_examId: string, id: string) => ({ id })) },
}));
vi.mock("../../src/lib/repositories/scoreRepository", () => ({
  scoreRepository: {
    getBySubmissionId: vi.fn(async (_examId: string, id: string) => [rowOf(id)]),
    saveOne: vi.fn(() => new Promise<void>((resolve) => (releaseSave = resolve))),
  },
}));
vi.mock("../../src/lib/services/trainingDonation", () => ({ flushAll: vi.fn(), flushQuestion: vi.fn(), stageVerifiedQuestion: vi.fn() }));

const { default: McItemVerificationView } = await import("../../src/lib/components/verify/McItemVerificationView.svelte");

const probe = () => (globalThis as { __probeProps?: Record<string, unknown> }).__probeProps!;
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

afterEach(cleanup);

describe("McItemVerificationView (issue #298)", () => {
  it("keeps the next item's record when a save resolves after Next", async () => {
    const stats = { items: [] } as unknown as McVerificationStats;
    const view = render(McItemVerificationView, { examId: "e", submissionId: "A", exerciseId: "ex", queue: "all", stats });
    await settle();
    expect((probe().scoreRecord as ExerciseScoreRecord).submissionId).toBe("A");

    const save = (probe().onSave as (...a: unknown[]) => Promise<void>)("ex", [1], 2, { confidence: "high", source: "manual" });
    await view.rerender({ examId: "e", submissionId: "B", exerciseId: "ex", queue: "all", stats });
    await settle();
    expect((probe().scoreRecord as ExerciseScoreRecord).submissionId).toBe("B");

    releaseSave();
    await save;
    await settle();
    expect((probe().scoreRecord as ExerciseScoreRecord).submissionId).toBe("B");
  });
});
