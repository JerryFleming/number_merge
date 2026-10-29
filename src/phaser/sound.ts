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
import celebrateUrl from "../assets/audio/celebrate.ogg";
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
  "celebrate",
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
  ["celebrate", celebrateUrl],
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
  /** True while the browser still blocks audio (no unlocking gesture yet). */
  readonly locked: boolean;
  /** Called whenever `locked` may have changed. */
  onLockChange(cb: () => void): void;
}

/** Plays the original clips via Phaser's sound manager. */
export class PhaserSfx implements Sfx {
  private _muted = false;
  /** Rotating index into MERGE_KEYS; advances one step per merge, wraps. */
  private mergeIndex = 0;

  constructor(private scene: Phaser.Scene) {
    // iOS only unlocks audio on gesture-*ending* events (touchend/click), not on
    // touchstart, which is where Phaser's pointerdown fires. Listen for those
    // natively (capture, so nothing upstream can swallow them) until the
    // context is running, so sound is on from the first tap.
    const events = ["touchend", "pointerup", "click", "keydown"] as const;
    const onGesture = (): void => {
      this.unlock();
      if (this.context?.state === "running") {
        for (const e of events) window.removeEventListener(e, onGesture, true);
      }
    };
    for (const e of events) window.addEventListener(e, onGesture, true);
  }

  get locked(): boolean {
    const ctx = this.context;
    return !!ctx && ctx.state !== "running";
  }

  onLockChange(cb: () => void): void {
    this.context?.addEventListener("statechange", cb);
  }

  private get context(): AudioContext | undefined {
    return (this.scene.sound as Phaser.Sound.BaseSoundManager & {
      context?: AudioContext;
    }).context;
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
  }

  unlock(): void {
    const ctx = this.context;
    // Web Audio backends expose a suspended context until a user gesture;
    // iOS also reports a non-standard "interrupted" state.
    if (!ctx || ctx.state === "running") return;
    void ctx.resume();
    // iOS also wants a source started inside the gesture: play one silent
    // sample so the output route actually opens.
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* unavailable — resume() alone is the best we can do */
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
