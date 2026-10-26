import type { Tier } from "./types";

export interface TierRange {
  min: Tier;
  max: Tier;
}

/**
 * Spawn-tier range as a function of the highest tier reached so far.
 * Matches the original game's default formula, recovered from the native
 * binary (NumberMatchGameplayUtilController.GetMin/MaxSpawnTierFromReachedTier,
 * RVA 0x36F0694 / 0x36F0A00 — see docs/reverse-engineering/spawn-tier-formula.md):
 *
 *   reach <  16 -> fixed 1..6
 *   reach >= 16 -> [reach-13, reach-8]  (a 6-tier window sliding up)
 *
 * Monotonic non-decreasing; min >= 1.
 */
export function spawnRange(reachedTier: Tier): TierRange {
  if (reachedTier < 16) return { min: 1, max: 6 };
  return { min: reachedTier - 13, max: reachedTier - 8 };
}

/** A uniformly-random tier within the (inclusive) range. */
export function randomTier(range: TierRange, rng: () => number): Tier {
  const span = range.max - range.min + 1;
  return range.min + Math.floor(rng() * span);
}
