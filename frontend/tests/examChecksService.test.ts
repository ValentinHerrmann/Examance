import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StepChecks } from "../src/lib/exam/examChecks";

const saved: StepChecks[] = [];
let gate: Promise<void> = Promise.resolve();
const saveStepChecks = vi.fn(async (_examId: string, checks: StepChecks) => {
  await gate;
  saved.push(checks);
});
vi.mock("../src/lib/repositories/examRepository", () => ({ examRepository: { saveStepChecks: (id: string, c: StepChecks) => saveStepChecks(id, c) } }));

const { saveExamChecks } = await import("../src/lib/exam/examChecksService");
const { examChecksState } = await import("../src/lib/stores/shell");

const tick = (key: string) => (c: StepChecks) => ({ ...c, [key]: true }) as StepChecks;

describe("saveExamChecks (issue #298)", () => {
  beforeEach(() => {
    saved.length = 0;
    saveStepChecks.mockClear();
    examChecksState.set(null);
  });

  it("builds a second quick save on the first one's checks", async () => {
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    const base = {} as StepChecks;
    const first = saveExamChecks("e1", base, tick("a"));
    const second = saveExamChecks("e1", base, tick("b"));
    release();
    await Promise.all([first, second]);
    expect(saved.at(-1)).toMatchObject({ a: true, b: true });
  });

  it("keeps saving after a failed save", async () => {
    gate = Promise.resolve();
    saveStepChecks.mockRejectedValueOnce(new Error("offline"));
    const failed = saveExamChecks("e2", {} as StepChecks, tick("a"));
    const next = saveExamChecks("e2", {} as StepChecks, tick("b"));
    await expect(failed).rejects.toThrow("offline");
    await next;
    expect(saved.at(-1)).toMatchObject({ b: true });
    expect(saved.at(-1)).not.toHaveProperty("a");
  });
});
