import { describe, it, expect } from "vitest";
import { canExtendChain, applyPointer } from "../../src/core/connect";
import { createGrid } from "../../src/core/board";
import type { Grid, Pos } from "../../src/core/types";

describe("canExtendChain", () => {
  it("allows equal tiers from the opening pair on", () => {
    expect(canExtendChain(3, 3, 1)).toBe(true);
    expect(canExtendChain(3, 3, 4)).toBe(true);
  });
  it("forbids +1 on the opening pair (chainLength 1)", () => {
    expect(canExtendChain(3, 4, 1)).toBe(false);
  });
  it("allows +1 once the chain holds >= 2 blocks", () => {
    expect(canExtendChain(3, 4, 2)).toBe(true);
  });
  it("forbids non-+1 ascents and any descent", () => {
    expect(canExtendChain(3, 5, 5)).toBe(false);
    expect(canExtendChain(4, 3, 5)).toBe(false);
  });
});

// A board where tiers equal their column index (row-invariant), so we can
// make equal-adjacent and +1-adjacent pairs by choosing columns.
function tierByCol(): Grid {
  return createGrid((p) => ({ tier: p.col + 1 }));
}
const P = (col: number, row: number): Pos => ({ col, row });

describe("applyPointer", () => {
  it("opens a chain on an empty path", () => {
    const g = tierByCol();
    expect(applyPointer(g, [], P(0, 0))).toEqual([P(0, 0)]);
  });

  it("appends an equal-tier adjacent block", () => {
    const g = tierByCol();
    // (0,0) tier1 and (0,1) tier1 are equal and adjacent (same column)
    expect(applyPointer(g, [P(0, 0)], P(0, 1))).toEqual([P(0, 0), P(0, 1)]);
  });

  it("refuses a +1 step on the opening pair", () => {
    const g = tierByCol();
    // (0,0) tier1, (1,0) tier2 -> +1 but chainLength is 1 -> refused
    expect(applyPointer(g, [P(0, 0)], P(1, 0))).toEqual([P(0, 0)]);
  });

  it("allows a +1 step once the chain has >= 2 blocks", () => {
    const g = tierByCol();
    const path = [P(0, 0), P(0, 1)]; // two tier-1 blocks
    // (1,1) is tier2, adjacent to head (0,1); chainLength 2 -> +1 allowed
    expect(applyPointer(g, path, P(1, 1))).toEqual([P(0, 0), P(0, 1), P(1, 1)]);
  });

  it("refuses a non-adjacent block", () => {
    const g = tierByCol();
    expect(applyPointer(g, [P(0, 0)], P(3, 3))).toEqual([P(0, 0)]);
  });

  it("backtracks when the pointer lands on an earlier path member", () => {
    const g = tierByCol();
    const path = [P(0, 0), P(0, 1), P(0, 2)];
    // move back onto (0,1): truncate so (0,1) is last
    expect(applyPointer(g, path, P(0, 1))).toEqual([P(0, 0), P(0, 1)]);
  });

  it("revisiting the head collapses to a 1-length path", () => {
    const g = tierByCol();
    const path = [P(0, 0), P(0, 1), P(0, 2)];
    expect(applyPointer(g, path, P(0, 0))).toEqual([P(0, 0)]);
  });

  it("ignores a pointer on an empty cell", () => {
    const g = createGrid(() => null);
    expect(applyPointer(g, [], P(2, 2))).toEqual([]);
  });
});
