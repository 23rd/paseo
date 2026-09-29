import { describe, expect, it } from "vitest";
import { BREAKPOINTS, isCompactWindowWidth } from "./breakpoints";

describe("pane layout width", () => {
  it("keeps a narrow window compact on a large physical display", () => {
    expect(isCompactWindowWidth(443)).toBe(true);
  });

  it("switches at the same medium breakpoint used by styles", () => {
    expect(isCompactWindowWidth(BREAKPOINTS.md - 1)).toBe(true);
    expect(isCompactWindowWidth(BREAKPOINTS.md)).toBe(false);
    expect(isCompactWindowWidth(852)).toBe(false);
  });
});
