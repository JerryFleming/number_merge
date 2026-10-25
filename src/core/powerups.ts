import { cellAt } from "./board";
import { mergeTotal, tierFromTotal } from "./merge";
import { ROWS, COLS, type Cell, type Grid, type Pos } from "./types";

function clone(grid: Grid): Grid {
  return grid.map((r) => r.slice());
}

/** Destroy the targeted block; other cells unchanged. */
export function hammer(grid: Grid, target: Pos): Grid {
  const out = clone(grid);
  out[target.row][target.col] = null;
  return out;
}

/** All positions whose block shares the target cell's tier (incl. the target). */
function positionsOfTargetTier(grid: Grid, target: Pos): Pos[] {
  const tc = cellAt(grid, target);
  if (!tc) return [];
  const out: Pos[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = grid[row][col];
      if (c && c.tier === tc.tier) out.push({ col, row });
    }
  }
  return out;
}

/** True iff at least two blocks (incl. the target) share the target's tier. */
export function magnetUsable(grid: Grid, target: Pos): boolean {
  return positionsOfTargetTier(grid, target).length >= 2;
}

/**
 * Gather every block of the tapped cell's tier into the tapped cell, resolving
 * to one block at the summed tier (floor(log2(total))). Returns null (no
 * change) when the tier is a singleton.
 */
export function magnet(grid: Grid, target: Pos): Grid | null {
  const positions = positionsOfTargetTier(grid, target);
  if (positions.length < 2) return null;
  const tiers = positions.map((p) => (grid[p.row][p.col] as Cell).tier);
  const resultTier = tierFromTotal(mergeTotal(tiers));
  const out = clone(grid);
  for (const p of positions) out[p.row][p.col] = null;
  out[target.row][target.col] = { tier: resultTier };
  return out;
}

/** Exchange the contents of two cells. Any two distinct positions are valid. */
export function swap(grid: Grid, a: Pos, b: Pos): Grid {
  const out = clone(grid);
  const tmp = out[a.row][a.col];
  out[a.row][a.col] = out[b.row][b.col];
  out[b.row][b.col] = tmp;
  return out;
}
