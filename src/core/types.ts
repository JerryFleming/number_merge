/** A block's tier: an integer >= 1. Its value is 2^tier. */
export type Tier = number;

/** A single block on the board. */
export interface Cell {
  tier: Tier;
}

/** A grid coordinate. */
export interface Pos {
  col: number;
  row: number;
}

/** The board: row-major, `grid[row][col]`, null = empty cell. */
export type Grid = (Cell | null)[][];

export const COLS = 5;
export const ROWS = 7;

/** The numeric value of a tier: 2^tier (exact as a JS number through tier 53). */
export function tierValue(tier: Tier): number {
  return 2 ** tier;
}
