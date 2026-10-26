import { cellAt } from "./board";
import { tierValue, type Grid, type Pos, type Tier } from "./types";

export interface MergeResult {
  /** Cell where the merged block is placed, before gravity (the last block selected). */
  landed: Pos;
  /** Cell where the merged block comes to rest after gravity collapse. */
  restingPos: Pos;
  /** Tier of the merged block: ceil(log2(total)). */
  tier: Tier;
  /** Score banked for the merge: the merged block's value (2^tier), matching
   * the original game (it awards the result's value, not the summed total). */
  score: bigint;
  /** Cells consumed by the merge, in path order. */
  consumed: Pos[];
}

/** Sum of 2^tier over the chain's tiers. */
export function mergeTotal(tiers: Tier[]): number {
  return tiers.reduce((sum, t) => sum + tierValue(t), 0);
}

/**
 * The merged block's tier: the SMALLEST tier whose value (2^tier) is >= total,
 * i.e. the total rounded UP to the next power of two. Matches the original
 * game (three 64s -> 256, three 32s + a 64 -> 256); no value is "lost".
 */
export function tierFromTotal(total: number): Tier {
  return Math.ceil(Math.log2(total));
}

/**
 * Resolve a committed drag path into a merge, or null if the chain is too
 * short (< 2 blocks). The merged block's tier rounds the total UP to the next
 * power of two, and the score awarded is that merged block's value (2^tier) —
 * matching the original, which banks the result's value rather than the sum.
 */
export function resolveMerge(grid: Grid, path: Pos[]): MergeResult | null {
  if (path.length < 2) return null;
  const tiers = path.map((p) => {
    const c = cellAt(grid, p);
    return c ? c.tier : 0;
  });
  const total = mergeTotal(tiers);
  const tier = tierFromTotal(total);
  const landed = path[path.length - 1];
  return {
    landed,
    // Default; commit() updates this once the board has collapsed.
    restingPos: landed,
    tier,
    score: BigInt(tierValue(tier)),
    consumed: path,
  };
}
