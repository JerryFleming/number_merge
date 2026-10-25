import { describe, it, expect } from "vitest";
import { chainPitch, SFX_NAMES, type SfxName } from "../../src/phaser/sound";

describe("chainPitch", () => {
  it("rises with chain length so longer chains sound higher", () => {
    expect(chainPitch(2)).toBeLessThan(chainPitch(3));
    expect(chainPitch(3)).toBeLessThan(chainPitch(6));
  });
  it("is a positive, audible frequency", () => {
    for (const n of [2, 5, 20, 100]) {
      expect(chainPitch(n)).toBeGreaterThan(0);
      expect(chainPitch(n)).toBeLessThan(20000); // within human hearing
    }
  });
  it("clamps very long chains so pitch stays musical, not screeching", () => {
    expect(chainPitch(1000)).toBe(chainPitch(13));
  });
});

describe("SFX_NAMES", () => {
  it("covers the game's sound events", () => {
    const expected: SfxName[] = [
      "select",
      "deselect",
      "merge",
      "invalid",
      "powerup",
      "gameover",
    ];
    for (const e of expected) expect(SFX_NAMES).toContain(e);
  });
});
