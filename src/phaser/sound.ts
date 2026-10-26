/**
 * Sound effects using the original game's extracted audio clips (.ogg),
 * played through Phaser's sound manager. One short clip per event.
 */
import Phaser from "phaser";
import selectUrl from "../assets/audio/select.ogg";
import deselectUrl from "../assets/audio/deselect.ogg";
import mergeUrl from "../assets/audio/merge.ogg";
import invalidUrl from "../assets/audio/invalid.ogg";
import hammerUrl from "../assets/audio/hammer.ogg";
import magnetUrl from "../assets/audio/magnet.ogg";
import swapUrl from "../assets/audio/swap.ogg";
import gameoverUrl from "../assets/audio/gameover.ogg";
import newgameUrl from "../assets/audio/newgame.ogg";

export const SFX_NAMES = [
  "select",
  "deselect",
  "merge",
  "invalid",
  "hammer",
  "magnet",
  "swap",
  "gameover",
  "newgame",
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

/** [textureKey, url] pairs; the key is both the Phaser audio key and SfxName. */
export const AUDIO_ASSETS: ReadonlyArray<readonly [SfxName, string]> = [
  ["select", selectUrl],
  ["deselect", deselectUrl],
  ["merge", mergeUrl],
  ["invalid", invalidUrl],
  ["hammer", hammerUrl],
  ["magnet", magnetUrl],
  ["swap", swapUrl],
  ["gameover", gameoverUrl],
  ["newgame", newgameUrl],
];

export interface Sfx {
  /** Play a one-shot effect. */
  play(name: SfxName): void;
  /** Resume the audio context after a user gesture (browser autoplay rules). */
  unlock(): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

/** Plays the original clips via Phaser's sound manager. */
export class PhaserSfx implements Sfx {
  private _muted = false;

  constructor(private scene: Phaser.Scene) {}

  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
  }

  unlock(): void {
    const mgr = this.scene.sound as Phaser.Sound.BaseSoundManager & {
      context?: AudioContext;
    };
    // Web Audio backends expose a suspended context until a user gesture.
    if (mgr.context && mgr.context.state === "suspended") {
      void mgr.context.resume();
    }
  }

  play(name: SfxName): void {
    if (this._muted) return;
    // Guard: the clip may not have finished loading, or audio is unavailable.
    if (!this.scene.sound.get(name) && !this.scene.cache.audio.exists(name)) {
      return;
    }
    try {
      this.scene.sound.play(name);
    } catch {
      /* decoding/playback failure — stay silent rather than throw */
    }
  }
}
