import { describe, it, expect } from "vitest";
import {
  cellSize,
  cellCenter,
  posFromPixel,
  gridOrigin,
  GUTTER,
} from "../../src/phaser/layout";
import { COLS, type Pos } from "../../src/core/types";

const P = (col: number, row: number): Pos => ({ col, row });

describe("cellSize", () => {
  it("fits all columns within a phone-width viewport including gutters", () => {
    const w = 360;
    const h = 740;
    const size = cellSize(w, h);
    expect(size * COLS + GUTTER * 2).toBeLessThanOrEqual(w);
    expect(size).toBeGreaterThan(0);
  });
});

describe("cellCenter / posFromPixel round-trip", () => {
  it("maps a cell to a pixel and back to the same cell", () => {
    const size = cellSize(360, 740);
    const origin = gridOrigin(360, 740, size);
    for (const p of [P(0, 0), P(4, 6), P(2, 3), P(1, 5)]) {
      const c = cellCenter(p, origin, size);
      expect(posFromPixel(c.x, c.y, origin, size)).toEqual(p);
    }
  });

  it("returns null for a pixel outside the grid", () => {
    const size = cellSize(360, 740);
    const origin = gridOrigin(360, 740, size);
    expect(posFromPixel(origin.x - size, origin.y, origin, size)).toBeNull();
    expect(posFromPixel(origin.x, origin.y - size, origin, size)).toBeNull();
  });
});
