import { cellAt, neighbors8 } from "./board";
import { COLS, ROWS, type Grid, type Pos } from "./types";

/**
 * True if any valid chain can be started. Because the opening pair must be
 * equal (see the connect rule), a move exists iff some 8-way adjacent pair
 * shares a tier.
 */
export function hasAnyMove(grid: Grid): boolean {
  return findAnyMove(grid) !== null;
}

/**
 * Find one valid opening move: an 8-way adjacent pair sharing a tier (the
 * opening pair must be equal). Returns the two positions, or null if there are
 * no moves. Used to highlight a hint when the player is stuck.
 */
export function findAnyMove(grid: Grid): [Pos, Pos] | null {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const pos: Pos = { col, row };
      const cell = cellAt(grid, pos);
      if (!cell) continue;
      for (const n of neighbors8(pos)) {
        const nc = cellAt(grid, n);
        if (nc && nc.tier === cell.tier) return [pos, n];
      }
    }
  }
  return null;
}
