import { describe, it, expect } from "vitest";
import { tierLabel } from "../../src/phaser/theme";

// tierLabel renders a block's value (2^tier). Values are always powers of two.
describe("tierLabel", () => {
  it("shows full numbers below 1000", () => {
    expect(tierLabel(1)).toBe("2"); // 2^1
    expect(tierLabel(9)).toBe("512"); // 2^9
  });

  it("drops a trailing .0 in the K range (2K, not 2.0K)", () => {
    expect(tierLabel(10)).toBe("1K"); // 1024
    expect(tierLabel(11)).toBe("2K"); // 2048
  });

  it("keeps a meaningful decimal in the K range", () => {
    expect(tierLabel(12)).toBe("4.1K"); // 4096
    expect(tierLabel(16)).toBe("65.5K"); // 65536
  });

  it("drops a trailing .0 in the M and B ranges too", () => {
    expect(tierLabel(20)).toBe("1M"); // 1048576
    expect(tierLabel(30)).toBe("1.1B"); // 1073741824
  });
});
