import { randomTier, type TierRange } from "./spawn";
import { COLS, ROWS, type Cell, type Grid } from "./types";

/**
 * Within each column, non-null cells fall to the bottom and nulls rise to the
 * top, preserving each column's block order and count. Returns a new grid.
 */
export function collapseColumns(grid: Grid): Grid {
  const out: Grid = Array.from({ length: ROWS }, () =>
    Array<Cell | null>(COLS).fill(null),
  );
  for (let col = 0; col < COLS; col++) {
    const blocks: Cell[] = [];
    for (let row = 0; row < ROWS; row++) {
      const c = grid[row][col];
      if (c) blocks.push(c);
    }
    // Place from the bottom up, keeping top->bottom order.
    let row = ROWS - 1;
    for (let i = blocks.length - 1; i >= 0; i--) {
      out[row][col] = blocks[i];
      row--;
    }
  }
  return out;
}

/** Fill every null cell with a fresh block drawn from `range`. */
export function refill(grid: Grid, range: TierRange, rng: () => number): Grid {
  return grid.map((r) =>
    r.map((c) => (c === null ? { tier: randomTier(range, rng) } : c)),
  );
}
