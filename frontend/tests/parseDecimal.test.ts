import { describe, expect, it } from "vitest";
import { parseDecimal } from "../src/lib/utils/parseDecimal";

describe("parseDecimal (issue #299)", () => {
  it.each([
    ["5", 5],
    ["5,5", 5.5],
    ["5.5", 5.5],
    [" 5 ", 5],
    [",5", 0.5],
    ["5,", 5],
    ["-1", -1],
    ["+2", 2],
  ])("reads %j as %d", (raw, expected) => {
    expect(parseDecimal(raw)).toBe(expected);
  });

  it.each(["", "  ", "5abc", "abc", "1e3", "0x10", "5,5,5", "5.5.5", "Infinity", "-", "."])("refuses %j", (raw) => {
    expect(parseDecimal(raw)).toBeNull();
  });

  it("treats null and undefined as blank", () => {
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });
});
