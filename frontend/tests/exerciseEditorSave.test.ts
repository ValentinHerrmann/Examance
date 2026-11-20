import { describe, expect, it } from "vitest";
import { ResourceSyncError, resourceSyncError } from "../src/lib/exercise-library/exerciseEditorSave";

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
});
