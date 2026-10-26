import { describe, it, expect } from "vitest";
import { mergeTotal, tierFromTotal, resolveMerge } from "../../src/core/merge";
import { createGrid } from "../../src/core/board";
import type { Grid, Pos } from "../../src/core/types";

const P = (col: number, row: number): Pos => ({ col, row });

describe("mergeTotal", () => {
  it("sums 2^tier over the tiers", () => {
    expect(mergeTotal([3, 3])).toBe(16);
    expect(mergeTotal([3, 3, 3])).toBe(24);
    expect(mergeTotal([1, 2, 3])).toBe(2 + 4 + 8);
  });
});

describe("tierFromTotal", () => {
  it("is the smallest tier whose value is >= total (ceil to next power of two)", () => {
    expect(tierFromTotal(16)).toBe(4); // exact power of two
    expect(tierFromTotal(24)).toBe(5); // 8+8+8 -> next pow2 is 32 = 2^5
    expect(tierFromTotal(192)).toBe(8); // 3x64 -> 256 = 2^8
    expect(tierFromTotal(160)).toBe(8); // 3x32 + 64 -> 256 = 2^8
    expect(tierFromTotal(2)).toBe(1);
  });
});

// Place specific tiers at specific cells.
function gridWith(tiers: Record<string, number>): Grid {
  return createGrid((p) => {
    const t = tiers[`${p.col},${p.row}`];
    return t === undefined ? null : { tier: t };
  });
}

describe("resolveMerge", () => {
  it("returns null for a chain shorter than 2", () => {
    const g = gridWith({ "0,0": 3 });
    expect(resolveMerge(g, [P(0, 0)])).toBeNull();
    expect(resolveMerge(g, [])).toBeNull();
  });

  it("merges two equal blocks into one tier higher at the last cell", () => {
    const g = gridWith({ "0,0": 3, "0,1": 3 });
    const r = resolveMerge(g, [P(0, 0), P(0, 1)]);
    expect(r).not.toBeNull();
    expect(r!.tier).toBe(4);
    expect(r!.score).toBe(16n); // the merged block's value, 2^4
    expect(r!.landed).toEqual(P(0, 1));
    expect(r!.consumed).toEqual([P(0, 0), P(0, 1)]);
  });

  it("scores the merged block's value, not the summed total", () => {
    const g = gridWith({ "0,0": 3, "0,1": 3, "0,2": 3 });
    const r = resolveMerge(g, [P(0, 0), P(0, 1), P(0, 2)]);
    expect(r!.tier).toBe(5); // 8+8+8 = 24 -> next pow2 is 32 = 2^5
    expect(r!.score).toBe(32n); // the merged block's value 2^5, not the 24 sum
    expect(r!.landed).toEqual(P(0, 2));
  });

  it("matches the original on mixed-tier chains (scores the result value)", () => {
    // three tier-5 (32) + one tier-6 (64) = 160 -> result 256 = 2^8
    const g = gridWith({ "0,0": 5, "0,1": 5, "1,1": 5, "1,0": 6 });
    const r = resolveMerge(g, [P(0, 0), P(0, 1), P(1, 1), P(1, 0)]);
    expect(r!.tier).toBe(8);
    expect(r!.score).toBe(256n); // 2^8, the merged block's value
  });
});
