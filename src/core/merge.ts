import { cellAt } from "./board";
import { tierValue, type Grid, type Pos, type Tier } from "./types";

export interface MergeResult {
  /** Cell where the merged block is placed, before gravity (the last block selected). */
  landed: Pos;
  /** Cell where the merged block comes to rest after gravity collapse. */
  restingPos: Pos;
  /** Tier of the merged block: floor(log2(total)). */
  tier: Tier;
  /** Full summed value of the chain, banked to the score. */
  score: bigint;
  /** Cells consumed by the merge, in path order. */
  consumed: Pos[];
}

/** Sum of 2^tier over the chain's tiers. */
export function mergeTotal(tiers: Tier[]): number {
  return tiers.reduce((sum, t) => sum + tierValue(t), 0);
}

/** The merged block's tier: the largest tier whose value is <= total. */
export function tierFromTotal(total: number): Tier {
  return Math.floor(Math.log2(total));
}

/**
 * Resolve a committed drag path into a merge, or null if the chain is too
 * short (< 2 blocks). Leftover value above the floor tier is discarded; the
 * score still reflects the full summed total.
 */
export function resolveMerge(grid: Grid, path: Pos[]): MergeResult | null {
  if (path.length < 2) return null;
  const tiers = path.map((p) => {
    const c = cellAt(grid, p);
    return c ? c.tier : 0;
  });
  const total = mergeTotal(tiers);
  const landed = path[path.length - 1];
  return {
    landed,
    // Default; commit() updates this once the board has collapsed.
    restingPos: landed,
    tier: tierFromTotal(total),
    score: BigInt(total),
    consumed: path,
  };
}
