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
  it("is floor(log2(total))", () => {
    expect(tierFromTotal(16)).toBe(4);
    expect(tierFromTotal(24)).toBe(4); // not a power of two -> floors down
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
    expect(r!.score).toBe(16n);
    expect(r!.landed).toEqual(P(0, 1));
    expect(r!.consumed).toEqual([P(0, 0), P(0, 1)]);
  });

  it("floors a non-power-of-two total but banks the full score", () => {
    const g = gridWith({ "0,0": 3, "0,1": 3, "0,2": 3 });
    const r = resolveMerge(g, [P(0, 0), P(0, 1), P(0, 2)]);
    expect(r!.tier).toBe(4); // floor(log2(24))
    expect(r!.score).toBe(24n); // full sum, not 16
    expect(r!.landed).toEqual(P(0, 2));
  });
});
