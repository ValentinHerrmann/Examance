import { describe, expect, it } from "vitest";
import { bytesToHex, sha256Hex } from "../src/lib/crypto/hex";

describe("crypto/hex (issue #299)", () => {
  it("writes two lowercase digits per byte", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
    expect(bytesToHex(new Uint8Array([171, 205]).buffer)).toBe("abcd");
  });

  it("hashes strings as UTF-8 and bytes as they are", async () => {
    const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await sha256Hex("abc")).toBe(abc);
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(abc);
    expect(await sha256Hex(new TextEncoder().encode("abc").buffer)).toBe(abc);
  });
});
