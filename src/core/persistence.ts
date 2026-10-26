import { COLS, ROWS, type Grid, type Tier } from "./types";

/** Bump when the save shape changes incompatibly; old saves are then discarded. */
export const SAVE_VERSION = 1;

type PowerUpKey = "hammer" | "magnet" | "swap";
type UseCounts = Record<PowerUpKey, number>;

function zeroCounts(): UseCounts {
  return { hammer: 0, magnet: 0, swap: 0 };
}

/** The persistent part of a game: board + score + progress + power-up use
 * counts. Transient drag and targeting state are deliberately not saved. */
export interface SaveState {
  grid: Grid;
  score: bigint;
  reachedTier: Tier;
  /** Optional on input (older callers/saves omit it); always set on read. */
  useCounts?: UseCounts;
}

interface SaveEnvelope {
  version: number;
  grid: (Tier | null)[][];
  score: string; // bigint as a decimal string
  reachedTier: number;
  useCounts?: UseCounts; // added after v1; absent in older saves
}

export function serialize(state: SaveState): string {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    grid: state.grid.map((row) => row.map((c) => (c ? c.tier : null))),
    score: state.score.toString(),
    reachedTier: state.reachedTier,
    useCounts: state.useCounts ?? zeroCounts(),
  };
  return JSON.stringify(envelope);
}

/** Parse a saved string, or null if it is absent, malformed, or incompatible. */
export function deserialize(json: string | null): SaveState | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isEnvelope(raw)) return null;
  if (raw.version !== SAVE_VERSION) return null;
  if (raw.grid.length !== ROWS) return null;
  if (!raw.grid.every((row) => row.length === COLS)) return null;

  let score: bigint;
  try {
    score = BigInt(raw.score);
  } catch {
    return null;
  }

  const grid: Grid = raw.grid.map((row) =>
    row.map((t) => (t === null ? null : { tier: t })),
  );
  return { grid, score, reachedTier: raw.reachedTier, useCounts: readCounts(raw.useCounts) };
}

/** Coerce a saved useCounts (possibly absent or partial) to a full count map. */
function readCounts(raw: unknown): UseCounts {
  const out = zeroCounts();
  if (raw && typeof raw === "object") {
    for (const k of ["hammer", "magnet", "swap"] as PowerUpKey[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

function isEnvelope(x: unknown): x is SaveEnvelope {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.version === "number" &&
    Array.isArray(o.grid) &&
    o.grid.every(
      (row) =>
        Array.isArray(row) &&
        row.every((c) => c === null || typeof c === "number"),
    ) &&
    typeof o.score === "string" &&
    typeof o.reachedTier === "number"
  );
}
