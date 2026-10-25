import { describe, it, expect } from "vitest";
import { seedBoard } from "../../src/core/seed";
import { cellAt } from "../../src/core/board";
import { COLS, ROWS, type Grid, type Pos } from "../../src/core/types";

describe("seedBoard", () => {
  it("re-rolls until hasMove is satisfied", () => {
    let calls = 0;
    const hasMove = () => {
      calls++;
      return calls >= 3; // reject first two grids, accept the third
    };
    const grid = seedBoard(() => 0.5, hasMove);
    expect(calls).toBe(3);
    expect(grid).not.toBeNull();
  });

  it("returns a fully filled board when the first roll is accepted", () => {
    const grid: Grid = seedBoard(() => 0.5, () => true);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const p: Pos = { col, row };
        expect(cellAt(grid, p)).not.toBeNull();
      }
    }
  });
});
