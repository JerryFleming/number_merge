import { describe, it, expect } from "vitest";
import { spawnRange, randomTier } from "../../src/core/spawn";

describe("spawnRange", () => {
  // Matches the original's default formula (recovered from native disassembly):
  // reach < 16 -> fixed 1..6; reach >= 16 -> [reach-13, reach-8] (6 wide).
  it("is a fixed 1..6 window before reaching tier 16", () => {
    for (const t of [1, 5, 10, 15]) {
      expect(spawnRange(t)).toEqual({ min: 1, max: 6 });
    }
  });

  it("slides a 6-tier window up once tier 16 is reached", () => {
    expect(spawnRange(16)).toEqual({ min: 3, max: 8 }); // 16-13, 16-8
    expect(spawnRange(20)).toEqual({ min: 7, max: 12 });
    expect(spawnRange(25)).toEqual({ min: 12, max: 17 });
  });

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
