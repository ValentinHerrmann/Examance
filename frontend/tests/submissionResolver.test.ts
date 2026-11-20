import { describe, it, expect, vi } from "vitest";
import { createSubmissionResolver } from "../src/lib/grading/submissionResolver";
import type { SubmissionRecord } from "../src/lib/db/schema";

const sub = (id: string, hmac: string) => ({ id, examId: "e", pseudonymHmac: hmac }) as SubmissionRecord;

describe("createSubmissionResolver (issue #298)", () => {
  it("creates one submission for two overlapping saves", async () => {
    const create = vi.fn(async (st: { pseudonymHmac: string }) => sub("s1", st.pseudonymHmac));
    const resolver = createSubmissionResolver(create);
    const [a, b] = await Promise.all([resolver.resolve({ pseudonymHmac: "h" }, new Map()), resolver.resolve({ pseudonymHmac: "h" }, new Map())]);
    expect(a).toBe(b);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps a created submission when a rebuilt map lacks it, and never creates it again", async () => {
    const create = vi.fn(async (st: { pseudonymHmac: string }) => sub("s1", st.pseudonymHmac));
    const resolver = createSubmissionResolver(create);
    const created = await resolver.resolve({ pseudonymHmac: "h" }, new Map());
    const rebuilt = resolver.merge(new Map([["other", sub("s0", "other")]]));
    expect(rebuilt.get("h")).toBe(created);
    expect(await resolver.resolve({ pseudonymHmac: "h" }, new Map())).toBe(created);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("prefers the rebuilt map's own entry", async () => {
    const resolver = createSubmissionResolver(async (st: { pseudonymHmac: string }) => sub("s1", st.pseudonymHmac));
    await resolver.resolve({ pseudonymHmac: "h" }, new Map());
    const stored = sub("server", "h");
    expect(resolver.merge(new Map([["h", stored]])).get("h")).toBe(stored);
  });

  it("retries after a failed creation", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(sub("s2", "h"));
    const resolver = createSubmissionResolver(create);
    await expect(resolver.resolve({ pseudonymHmac: "h" }, new Map())).rejects.toThrow("offline");
    expect((await resolver.resolve({ pseudonymHmac: "h" }, new Map())).id).toBe("s2");
  });
});
