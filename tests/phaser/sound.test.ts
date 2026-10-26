import { describe, it, expect } from "vitest";
import {
  SFX_NAMES,
  AUDIO_ASSETS,
  MERGE_KEYS,
  type SfxName,
} from "../../src/phaser/sound";

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
      "newgame",
    ];
    for (const e of expected) expect(SFX_NAMES).toContain(e);
  });
});

describe("AUDIO_ASSETS", () => {
  it("has a clip URL for every single-clip sound name", () => {
    const keys = AUDIO_ASSETS.map(([k]) => k);
    // Every event except 'merge' (which rotates through MERGE_KEYS) has a clip.
    for (const n of SFX_NAMES) {
      if (n === "merge") continue;
      expect(keys).toContain(n);
    }
  });
  it("loads every merge-rotation clip", () => {
    const keys = AUDIO_ASSETS.map(([k]) => k);
    for (const k of MERGE_KEYS) expect(keys).toContain(k);
    expect(MERGE_KEYS).toHaveLength(7);
  });
  it("points every entry at an .ogg asset", () => {
    for (const [, url] of AUDIO_ASSETS) expect(url).toMatch(/\.ogg/);
  });
});
