import { createGrid } from "./board";
import { randomTier, spawnRange } from "./spawn";
import type { Grid } from "./types";

/**
 * Seed a full board of low-tier blocks, re-rolling the whole grid until
 * `hasMove` reports at least one valid move. `hasMove` is injected so this
 * module needn't depend on the move-availability module.
 */
export function seedBoard(
  rng: () => number,
  hasMove: (grid: Grid) => boolean,
): Grid {
  const range = spawnRange(1);
  // Bounded loop guards against a predicate that never accepts.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const grid = createGrid(() => ({ tier: randomTier(range, rng) }));
    if (hasMove(grid)) return grid;
  }
  // Fallback: a board we know has an equal adjacent pair.
  return createGrid(() => ({ tier: range.min }));
}
