import { describe, it, expect } from "vitest";
import {
  createGrid,
  cellAt,
  inBounds,
  neighbors8,
  samePos,
} from "../../src/core/board";
import { COLS, ROWS } from "../../src/core/types";

describe("inBounds", () => {
  it("accepts in-range cells", () => {
    expect(inBounds({ col: 0, row: 0 })).toBe(true);
    expect(inBounds({ col: COLS - 1, row: ROWS - 1 })).toBe(true);
  });
  it("rejects out-of-range cells", () => {
    expect(inBounds({ col: -1, row: 0 })).toBe(false);
    expect(inBounds({ col: COLS, row: 0 })).toBe(false);
    expect(inBounds({ col: 0, row: ROWS })).toBe(false);
  });
});

describe("neighbors8", () => {
  it("returns only the 3 in-bounds neighbors for a corner", () => {
    const n = neighbors8({ col: 0, row: 0 });
    expect(n).toHaveLength(3);
    expect(n).toContainEqual({ col: 1, row: 0 });
    expect(n).toContainEqual({ col: 0, row: 1 });
    expect(n).toContainEqual({ col: 1, row: 1 });
  });
  it("returns 8 neighbors for an interior cell", () => {
    expect(neighbors8({ col: 2, row: 3 })).toHaveLength(8);
  });
});

describe("createGrid / cellAt", () => {
  it("builds a ROWS x COLS grid from the fill fn", () => {
    const grid = createGrid((p) => ({ tier: p.col + p.row }));
    expect(grid).toHaveLength(ROWS);
    expect(grid[0]).toHaveLength(COLS);
    expect(cellAt(grid, { col: 2, row: 1 })).toEqual({ tier: 3 });
  });
  it("supports null cells", () => {
    const grid = createGrid(() => null);
    expect(cellAt(grid, { col: 0, row: 0 })).toBeNull();
  });
});

describe("samePos", () => {
  it("compares coordinates", () => {
    expect(samePos({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true);
    expect(samePos({ col: 1, row: 2 }, { col: 2, row: 1 })).toBe(false);
  });
});
