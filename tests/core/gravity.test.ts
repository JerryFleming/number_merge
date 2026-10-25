import { describe, it, expect } from "vitest";
import { collapseColumns, refill } from "../../src/core/gravity";
import { cellAt, createGrid } from "../../src/core/board";
import { COLS, ROWS, type Cell, type Grid, type Pos } from "../../src/core/types";

const P = (col: number, row: number): Pos => ({ col, row });

function tierAt(grid: Grid, p: Pos): number | null {
  const c = cellAt(grid, p);
  return c ? c.tier : null;
}

describe("collapseColumns", () => {
  it("drops blocks to the bottom of their column with no floating gaps", () => {
    // Column 0: row0=t2, row1=null, row2=t5, rest null.
    const grid = createGrid((p) => {
      if (p.col !== 0) return null;
      if (p.row === 0) return { tier: 2 };
      if (p.row === 2) return { tier: 5 };
      return null;
    });
    const out = collapseColumns(grid);
    // Two blocks should rest at the bottom two rows, in original top->bottom order.
    expect(tierAt(out, P(0, ROWS - 2))).toBe(2);
    expect(tierAt(out, P(0, ROWS - 1))).toBe(5);
    // Everything above is empty.
    for (let row = 0; row < ROWS - 2; row++) {
      expect(tierAt(out, P(0, row))).toBeNull();
    }
  });

  it("preserves the block count per column", () => {
    const grid = createGrid((p) =>
      p.row % 2 === 0 ? ({ tier: 1 } as Cell) : null,
    );
    const before = grid.flat().filter(Boolean).length;
    const after = collapseColumns(grid).flat().filter(Boolean).length;
    expect(after).toBe(before);
  });
});

describe("refill", () => {
  it("fills every null cell and leaves existing blocks untouched", () => {
    const grid = createGrid((p) => (p.row === ROWS - 1 ? ({ tier: 9 } as Cell) : null));
    const out = refill(grid, { min: 1, max: 1 }, () => 0);
    for (let col = 0; col < COLS; col++) {
      expect(tierAt(out, P(col, ROWS - 1))).toBe(9); // untouched
      for (let row = 0; row < ROWS - 1; row++) {
        expect(tierAt(out, P(col, row))).toBe(1); // filled from range
      }
    }
  });
});
