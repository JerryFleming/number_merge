/**
 * Original, synthesized sound effects via the Web Audio API — no asset files.
 * The one piece of real logic (pitch rising with chain length) is pure and
 * unit-tested; the oscillator wiring is verified by building and playing.
 */

export const SFX_NAMES = [
  "select",
  "deselect",
  "merge",
  "invalid",
  "powerup",
  "gameover",
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

export interface Sfx {
  /** Play a one-shot effect. `chainLength` tunes the merge pitch. */
  play(name: SfxName, chainLength?: number): void;
  /** Resume the audio context after a user gesture (browser autoplay rules). */
  unlock(): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

const BASE_MERGE_HZ = 330; // E4
const SEMITONE = 2 ** (1 / 12);
const MAX_STEP = 11; // clamp so long chains stay musical, not screeching

/** Merge pitch: rises one semitone per extra block, clamped at MAX_STEP. */
export function chainPitch(chainLength: number): number {
  const step = Math.min(Math.max(chainLength - 2, 0), MAX_STEP);
  return BASE_MERGE_HZ * SEMITONE ** step;
}

interface Tone {
  freq: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  /** Optional linear frequency glide to this target over the duration. */
  sweepTo?: number;
}

/** Web Audio implementation. Safe to construct even where AudioContext is absent. */
export class WebAudioSfx implements Sfx {
  private ctx: AudioContext | null = null;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }
  setMuted(muted: boolean): void {
    this._muted = muted;
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  unlock(): void {
    const ctx = this.ensureCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  play(name: SfxName, chainLength = 2): void {
    if (this._muted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    for (const tone of this.tonesFor(name, chainLength)) {
      this.blip(ctx, tone);
    }
  }

  private tonesFor(name: SfxName, chainLength: number): Tone[] {
    switch (name) {
      case "select":
        return [{ freq: 660, type: "triangle", duration: 0.06, gain: 0.12 }];
      case "deselect":
        // A soft, quick downward blip — the "undo" of a select.
        return [
          { freq: 520, type: "triangle", duration: 0.05, gain: 0.1, sweepTo: 400 },
        ];
      case "merge": {
        const f = chainPitch(chainLength);
        return [
          { freq: f, type: "sine", duration: 0.12, gain: 0.22, sweepTo: f * 2 },
        ];
      }
      case "invalid":
        return [
          { freq: 180, type: "sawtooth", duration: 0.12, gain: 0.14, sweepTo: 120 },
        ];
      case "powerup":
        return [
          { freq: 440, type: "square", duration: 0.08, gain: 0.16 },
          { freq: 880, type: "square", duration: 0.1, gain: 0.14 },
        ];
      case "gameover":
        return [
          { freq: 440, type: "sine", duration: 0.18, gain: 0.2 },
          { freq: 349, type: "sine", duration: 0.18, gain: 0.2 },
          { freq: 262, type: "sine", duration: 0.32, gain: 0.2, sweepTo: 196 },
        ];
    }
  }

  private blip(ctx: AudioContext, tone: Tone): void {
    const now = ctx.currentTime;
    // For a chord/sequence, stagger multi-tone effects slightly.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, now);
    if (tone.sweepTo !== undefined) {
      osc.frequency.linearRampToValueAtTime(tone.sweepTo, now + tone.duration);
    }
    gain.gain.setValueAtTime(tone.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + tone.duration);
  }
}
