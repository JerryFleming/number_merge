/**
 * Sound effects using the original game's extracted audio clips (.ogg),
 * played through Phaser's sound manager. Most events are one clip; the merge
 * sound cycles through a list of clips (rising pitch) one step per merge, as
 * the original does (_mergeBlockAudioClips indexed by a wrapping play index).
 */
import Phaser from "phaser";
import selectUrl from "../assets/audio/select.ogg";
import deselectUrl from "../assets/audio/deselect.ogg";
import invalidUrl from "../assets/audio/invalid.ogg";
import hammerUrl from "../assets/audio/hammer.ogg";
import magnetUrl from "../assets/audio/magnet.ogg";
import swapUrl from "../assets/audio/swap.ogg";
import gameoverUrl from "../assets/audio/gameover.ogg";
import newgameUrl from "../assets/audio/newgame.ogg";
import merge1Url from "../assets/audio/merge1.ogg";
import merge2Url from "../assets/audio/merge2.ogg";
import merge3Url from "../assets/audio/merge3.ogg";
import merge4Url from "../assets/audio/merge4.ogg";
import merge5Url from "../assets/audio/merge5.ogg";
import merge6Url from "../assets/audio/merge6.ogg";
import merge7Url from "../assets/audio/merge7.ogg";

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

/** Phaser audio keys for the rising merge-clip rotation, in play order. */
export const MERGE_KEYS = [
  "merge1",
  "merge2",
  "merge3",
  "merge4",
  "merge5",
  "merge6",
  "merge7",
] as const;

/** [audioKey, url] pairs to feed this.load.audio() in preload(). Covers the
 * single-clip events plus every merge-rotation clip. */
export const AUDIO_ASSETS: ReadonlyArray<readonly [string, string]> = [
  ["select", selectUrl],
  ["deselect", deselectUrl],
  ["invalid", invalidUrl],
  ["hammer", hammerUrl],
  ["magnet", magnetUrl],
  ["swap", swapUrl],
  ["gameover", gameoverUrl],
  ["newgame", newgameUrl],
  ["merge1", merge1Url],
  ["merge2", merge2Url],
  ["merge3", merge3Url],
  ["merge4", merge4Url],
  ["merge5", merge5Url],
  ["merge6", merge6Url],
  ["merge7", merge7Url],
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
  /** Rotating index into MERGE_KEYS; advances one step per merge, wraps. */
  private mergeIndex = 0;

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
    if (name === "merge") {
      // Cycle through the merge clips (rising pitch), like the original.
      const key = MERGE_KEYS[this.mergeIndex];
      this.mergeIndex = (this.mergeIndex + 1) % MERGE_KEYS.length;
      this.playKey(key);
      return;
    }
    this.playKey(name);
  }

  private playKey(key: string): void {
    // Guard: the clip may not have finished loading, or audio is unavailable.
    if (!this.scene.cache.audio.exists(key)) return;
    try {
      this.scene.sound.play(key);
    } catch {
      /* decoding/playback failure — stay silent rather than throw */
    }
  }
}
