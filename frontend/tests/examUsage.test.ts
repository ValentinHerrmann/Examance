import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("../src/lib/api/client", () => ({ api: { get: (...a: unknown[]) => get(...a) } }));
vi.mock("../src/lib/utils/serverBacked", () => ({ isServerBacked: () => true }));

const { loadExamUsage } = await import("../src/lib/exercise-library/examUsage");

describe("loadExamUsage (issue #298)", () => {
  it("fails instead of answering from the local mirror when the server cannot answer", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    await expect(loadExamUsage(["ex1"])).rejects.toThrow("offline");
  });

  it("lists the exams the server reports", async () => {
    get.mockResolvedValueOnce({ exams: [{ id: "e1", title: "KA 1", datum: null }] });
    await expect(loadExamUsage(["ex1"])).resolves.toEqual([{ id: "e1", title: "KA 1", datum: undefined }]);
  });
});
