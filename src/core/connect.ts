import { cellAt, neighbors8, samePos } from "./board";
import type { Grid, Pos, Tier } from "./types";

/**
 * True if a block of `nextTier` may follow one of `prevTier`, given the chain
 * already holds `chainLength` blocks.
 *
 * Rule (from the original): equal always connects; +1 connects only once the
 * chain already holds >= 2 blocks, so the opening pair must be equal.
 */
export function canExtendChain(
  prevTier: Tier,
  nextTier: Tier,
  chainLength: number,
): boolean {
  if (nextTier === prevTier) return true;
  if (chainLength >= 2 && nextTier === prevTier + 1) return true;
  return false;
}

function indexOfPos(path: Pos[], pos: Pos): number {
  return path.findIndex((p) => samePos(p, pos));
}

function isAdjacent(a: Pos, b: Pos): boolean {
  return neighbors8(a).some((n) => samePos(n, b));
}

/**
 * Given the current drag `path` and the block the pointer is now over,
 * return the new path. Pure — never mutates its arguments.
 *
 * - empty path + a block under the pointer -> open the chain
 * - pointer on a position already in the path -> backtrack (truncate so that
 *   position is last); landing on the head yields a 1-length path
 * - pointer on an adjacent, valid next link not already in the path -> append
 * - anything else -> unchanged
 */
export function applyPointer(grid: Grid, path: Pos[], pointer: Pos): Pos[] {
  const cell = cellAt(grid, pointer);
  if (cell === null) return path;

  if (path.length === 0) return [pointer];

  const existing = indexOfPos(path, pointer);
  if (existing !== -1) {
    // backtrack: keep up to and including the revisited position
    return path.slice(0, existing + 1);
  }

  const head = path[path.length - 1];
  const headCell = cellAt(grid, head);
  if (headCell === null) return path;

  if (isAdjacent(head, pointer) && canExtendChain(headCell.tier, cell.tier, path.length)) {
    return [...path, pointer];
  }

  return path;
}
