import { describe, it, expect } from "vitest";
import {
  cellSize,
  cellCenter,
  posFromPixel,
  posFromPixelInner,
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

describe("posFromPixelInner", () => {
  const size = cellSize(360, 740);
  const origin = gridOrigin(360, 740, size);

  it("registers a cell at its center", () => {
    for (const p of [P(0, 0), P(4, 6), P(2, 3)]) {
      const c = cellCenter(p, origin, size);
      expect(posFromPixelInner(c.x, c.y, origin, size)).toEqual(p);
    }
  });

  it("returns null near a cell's edge (the gutter the finger grazes)", () => {
    const p = P(2, 3);
    const c = cellCenter(p, origin, size);
    // Just inside the right edge of the cell (within the default 22% inset).
    const nearRightEdge = c.x + size * 0.45;
    expect(posFromPixelInner(nearRightEdge, c.y, origin, size)).toBeNull();
    // ...but the full-cell hit still maps it to a cell (the old behavior).
    expect(posFromPixel(nearRightEdge, c.y, origin, size)).toEqual(p);
  });

  it("registers a diagonal neighbor's center without grabbing the orthogonal one", () => {
    // Drag starts at (1,5); the up-right diagonal is (2,4). Its center hits.
    const diag = P(2, 4);
    const cDiag = cellCenter(diag, origin, size);
    expect(posFromPixelInner(cDiag.x, cDiag.y, origin, size)).toEqual(diag);
    // The corner where (1,5), the diagonal, and the two orthogonal neighbors
    // meet is in the gutter for all of them → null (no accidental orthogonal grab).
    const corner = {
      x: origin.x + 2 * size, // shared vertical edge
      y: origin.y + 5 * size, // shared horizontal edge
    };
    expect(posFromPixelInner(corner.x, corner.y, origin, size)).toBeNull();
  });
});
