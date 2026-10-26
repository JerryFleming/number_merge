import { describe, it, expect } from "vitest";
import { tierLabel } from "../../src/phaser/theme";

// tierLabel renders a block's value (2^tier). Values are always powers of two.
describe("tierLabel", () => {
  it("shows full numbers below 1000", () => {
    expect(tierLabel(1)).toBe("2"); // 2^1
    expect(tierLabel(9)).toBe("512"); // 2^9
  });

  it("uses whole thousands in the K range (no fractions)", () => {
    expect(tierLabel(10)).toBe("1K"); // 1024 -> 1K
    expect(tierLabel(11)).toBe("2K"); // 2048 -> 2K
    expect(tierLabel(12)).toBe("4K"); // 4096 -> 4K (rounded from 4.096)
    expect(tierLabel(16)).toBe("66K"); // 65536 -> 66K (rounded from 65.536)
  });

  it("uses whole numbers in the M and B ranges too", () => {
    expect(tierLabel(20)).toBe("1M"); // 1048576 -> 1M
    expect(tierLabel(30)).toBe("1B"); // 1073741824 -> 1B
  });
});
