import { COLS, ROWS, type Grid, type Tier } from "./types";

/** Bump when the save shape changes incompatibly; old saves are then discarded. */
export const SAVE_VERSION = 1;

/** The persistent part of a game: board + score + progress. Transient drag
 * and targeting state are deliberately not saved. */
export interface SaveState {
  grid: Grid;
  score: bigint;
  reachedTier: Tier;
}

interface SaveEnvelope {
  version: number;
  grid: (Tier | null)[][];
  score: string; // bigint as a decimal string
  reachedTier: number;
}

export function serialize(state: SaveState): string {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    grid: state.grid.map((row) => row.map((c) => (c ? c.tier : null))),
    score: state.score.toString(),
    reachedTier: state.reachedTier,
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
  return { grid, score, reachedTier: raw.reachedTier };
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
