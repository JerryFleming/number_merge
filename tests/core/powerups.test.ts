import { describe, it, expect } from "vitest";
import { hammer, magnet, magnetUsable, swap } from "../../src/core/powerups";
import { cellAt, createGrid } from "../../src/core/board";
import type { Grid, Pos } from "../../src/core/types";

const P = (col: number, row: number): Pos => ({ col, row });

function gridWith(tiers: Record<string, number>): Grid {
  return createGrid((p) => {
    const t = tiers[`${p.col},${p.row}`];
    return t === undefined ? null : { tier: t };
  });
}
function tierAt(grid: Grid, p: Pos): number | null {
  const c = cellAt(grid, p);
  return c ? c.tier : null;
}

describe("hammer", () => {
  it("destroys the targeted block and leaves others", () => {
    const g = gridWith({ "0,0": 3, "1,0": 4 });
    const out = hammer(g, P(0, 0));
    expect(tierAt(out, P(0, 0))).toBeNull();
    expect(tierAt(out, P(1, 0))).toBe(4);
  });
});

describe("magnetUsable", () => {
  it("is false for a singleton tier", () => {
    const g = gridWith({ "0,0": 3, "1,0": 4 });
    expect(magnetUsable(g, P(0, 0))).toBe(false);
  });
  it("is true when two or more share the tier", () => {
    const g = gridWith({ "0,0": 3, "1,0": 3 });
    expect(magnetUsable(g, P(0, 0))).toBe(true);
  });
});

describe("magnet", () => {
  it("returns null and no change on a singleton tier", () => {
    const g = gridWith({ "0,0": 3, "1,0": 4 });
    expect(magnet(g, P(0, 0))).toBeNull();
  });
  it("gathers all of a tier into the tapped cell at the summed tier", () => {
    const g = gridWith({ "0,0": 3, "1,0": 3, "4,6": 3, "2,2": 7 });
    const out = magnet(g, P(4, 6))!;
    expect(out).not.toBeNull();
    // three tier-3 -> total 24 -> floor(log2 24) = 4 at the tapped cell
    expect(tierAt(out, P(4, 6))).toBe(4);
    // the other two tier-3 cells are cleared
    expect(tierAt(out, P(0, 0))).toBeNull();
    expect(tierAt(out, P(1, 0))).toBeNull();
    // unrelated block untouched
    expect(tierAt(out, P(2, 2))).toBe(7);
  });
});

describe("swap", () => {
  it("exchanges two blocks' positions with no merge", () => {
    const g = gridWith({ "0,0": 3, "4,6": 8 });
    const out = swap(g, P(0, 0), P(4, 6));
    expect(tierAt(out, P(0, 0))).toBe(8);
    expect(tierAt(out, P(4, 6))).toBe(3);
  });
  it("can move a block into an empty cell", () => {
    const g = gridWith({ "0,0": 3 });
    const out = swap(g, P(0, 0), P(2, 2));
    expect(tierAt(out, P(0, 0))).toBeNull();
    expect(tierAt(out, P(2, 2))).toBe(3);
  });
});
