import { describe, expect, it, vi } from "vitest";
import { ResourceSyncError, reportAfterSave, resourceSyncError } from "../src/lib/exercise-library/exerciseEditorSave";

describe("resourceSyncError (issue #298)", () => {
  it("is null when every file arrived", () => {
    expect(resourceSyncError({ errors: [] })).toBeNull();
  });

  it("names the files that did not upload and keeps the HTTP status", () => {
    const err = resourceSyncError({ errors: ["fig.png: upload failed"], status: 413 });
    expect(err).toBeInstanceOf(ResourceSyncError);
    expect(err?.files).toEqual(["fig.png: upload failed"]);
    expect(err?.message).toContain("fig.png");
    expect(err?.status).toBe(413);
  });

  it("reports a failure without a response as 503", () => {
    expect(resourceSyncError({ errors: ["fig.png: offline"] })?.status).toBe(503);
  });

  it("is null when only the file list failed", () => {
    expect(resourceSyncError({ errors: [], listFailed: true })).toBeNull();
  });
});

describe("reportAfterSave (issue #298)", () => {
  it("reports upload failures and never fails the stored save", async () => {
    const report = vi.fn();
    await expect(reportAfterSave(async () => Promise.reject(new ResourceSyncError(["fig.png: offline"], 503)), report)).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(503, expect.stringContaining("fig.png"));
  });

  it("reports a local storage error instead of rethrowing it", async () => {
    const report = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(reportAfterSave(async () => Promise.reject(new Error("QuotaExceededError")), report)).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(500, expect.any(String));
    warn.mockRestore();
  });

  it("reports nothing for a clean commit", async () => {
    const report = vi.fn();
    await reportAfterSave(async () => {}, report);
    expect(report).not.toHaveBeenCalled();
  });
});
