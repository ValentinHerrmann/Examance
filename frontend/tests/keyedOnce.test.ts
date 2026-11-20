import { describe, it, expect, vi } from "vitest";
import { createKeyedOnce } from "../src/lib/utils/keyedOnce";

describe("createKeyedOnce (issue #298)", () => {
  it("shares one in-flight task per key", async () => {
    const once = createKeyedOnce<string>();
    let resolve!: (v: string) => void;
    const task = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const first = once.run("h", task);
    const second = once.run("h", task);
    resolve("sub");
    expect(await first).toBe("sub");
    expect(await second).toBe("sub");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs another key on its own", async () => {
    const once = createKeyedOnce<string>();
    const task = vi.fn(async () => "x");
    await Promise.all([once.run("a", task), once.run("b", task)]);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("retries a key after its task failed", async () => {
    const once = createKeyedOnce<string>();
    await expect(once.run("h", async () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    await expect(once.run("h", async () => "sub")).resolves.toBe("sub");
  });
});
