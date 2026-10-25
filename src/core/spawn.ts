import type { Tier } from "./types";

export interface TierRange {
  min: Tier;
  max: Tier;
}

/**
 * Spawn-tier range as a function of the highest tier reached so far.
 * Monotonic non-decreasing; min >= 1. Simple builder-default rule: the window
 * is 4 tiers wide and its floor rises by 1 every 2 tiers reached beyond 3.
 */
export function spawnRange(reachedTier: Tier): TierRange {
  const min = 1 + Math.floor(Math.max(0, reachedTier - 3) / 2);
  return { min, max: min + 3 };
}

/** A uniformly-random tier within the (inclusive) range. */
export function randomTier(range: TierRange, rng: () => number): Tier {
  const span = range.max - range.min + 1;
  return range.min + Math.floor(rng() * span);
}
