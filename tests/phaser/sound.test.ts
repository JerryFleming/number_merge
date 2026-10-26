import { describe, it, expect } from "vitest";
import { SFX_NAMES, AUDIO_ASSETS, type SfxName } from "../../src/phaser/sound";

describe("SFX_NAMES", () => {
  it("covers the game's sound events", () => {
    const expected: SfxName[] = [
      "select",
      "deselect",
      "merge",
      "invalid",
      "hammer",
      "magnet",
      "swap",
      "gameover",
    ];
    for (const e of expected) expect(SFX_NAMES).toContain(e);
  });
});

describe("AUDIO_ASSETS", () => {
  it("has a clip URL for every sound name", () => {
    const keys = AUDIO_ASSETS.map(([k]) => k);
    for (const n of SFX_NAMES) expect(keys).toContain(n);
    expect(AUDIO_ASSETS).toHaveLength(SFX_NAMES.length);
  });
  it("points every entry at an .ogg asset", () => {
    for (const [, url] of AUDIO_ASSETS) expect(url).toMatch(/\.ogg/);
  });
});
