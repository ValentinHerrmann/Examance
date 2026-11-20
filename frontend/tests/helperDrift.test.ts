import { afterEach, describe, expect, it, vi } from "vitest";
import { slug } from "../src/lib/export/zip";
import { compareText } from "../src/lib/utils/listSort";
import { compareCodeUnits } from "../src/lib/utils/compare";

describe("one helper per job: the drifts of issue #299", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps umlauts readable in file names", () => {
    expect(slug("Prüfung Größe")).toBe("Pruefung_Groesse");
    expect(slug("", "exam")).toBe("exam");
  });

  it("sorts lists people read naturally", () => {
    expect(["10a", "2a", "1b"].sort(compareText)).toEqual(["1b", "2a", "10a"]);
  });

  it("orders cache keys the same in every locale", () => {
    const names = ["b.png", "B.png", "a-1.png", "a1.png", "ä.png"];
    expect([...names].sort(compareCodeUnits)).toEqual(["B.png", "a-1.png", "a1.png", "b.png", "ä.png"]);
  });

  it("never throws when the browser blocks storage", async () => {
    const blocked = new Proxy({}, { get: () => { throw new DOMException("blocked", "SecurityError"); } });
    vi.stubGlobal("localStorage", blocked);
    vi.stubGlobal("sessionStorage", blocked);
    vi.resetModules();
    const pen = await import("../src/lib/stores/penInput");
    const domainMove = await import("../src/lib/domainMove/index");
    expect(() => pen.markPenSeen()).not.toThrow();
    expect(() => pen.resetPenDetection()).not.toThrow();
    expect(() => domainMove.rememberOldPasskeySignIn(true)).not.toThrow();
    expect(domainMove.signedInWithOldPasskey()).toBe(false);
  });
});
