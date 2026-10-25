import { describe, it, expect } from "vitest";
import { spawnRange, randomTier } from "../../src/core/spawn";

describe("spawnRange", () => {
  it("never decreases min or max as reachedTier rises (monotonic)", () => {
    let prevMin = -Infinity;
    let prevMax = -Infinity;
    for (let t = 1; t <= 30; t++) {
      const { min, max } = spawnRange(t);
      expect(min).toBeGreaterThanOrEqual(prevMin);
      expect(max).toBeGreaterThanOrEqual(prevMax);
      expect(min).toBeGreaterThanOrEqual(1);
      expect(max).toBeGreaterThanOrEqual(min);
      prevMin = min;
      prevMax = max;
    }
  });
});

describe("randomTier", () => {
  it("stays within the range", () => {
    const range = { min: 2, max: 5 };
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const t = randomTier(range, () => r);
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThanOrEqual(5);
    }
  });
});
