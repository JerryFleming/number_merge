import { describe, it, expect } from "vitest";
import { serialize, deserialize, SAVE_VERSION } from "../../src/core/persistence";
import { Game } from "../../src/core/game";
import { cellAt } from "../../src/core/board";
import { COLS, ROWS, type Cell, type Grid, type Pos } from "../../src/core/types";

const P = (col: number, row: number): Pos => ({ col, row });

function gridOf(rest: number, special: Record<string, number>): Grid {
  const g: Grid = [];
  for (let row = 0; row < ROWS; row++) {
    const r: (Cell | null)[] = [];
    for (let col = 0; col < COLS; col++) {
      const t = special[`${col},${row}`];
      r.push({ tier: t === undefined ? rest : t });
    }
    g.push(r);
  }
  return g;
}

describe("serialize / deserialize round-trip", () => {
  it("restores grid, score, and reachedTier exactly", () => {
    const game = new Game({ initialGrid: gridOf(2, { "0,0": 8, "0,1": 8 }) });
    game.pointer(P(0, 0));
    game.pointer(P(0, 1));
    game.commit(); // score 2^8+2^8 = 512, reachedTier 9

    const json = serialize(game);
    const state = deserialize(json)!;
    expect(state).not.toBeNull();
    expect(state.score).toBe(game.score);
    expect(state.reachedTier).toBe(game.reachedTier);
    // grid cell-for-cell
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        expect(cellAt(state.grid, P(col, row))).toEqual(
          cellAt(game.grid, P(col, row)),
        );
      }
    }
  });

  it("preserves null (empty) cells", () => {
    const grid = gridOf(3, {});
    grid[2][2] = null;
    const game = new Game({ initialGrid: grid });
    const state = deserialize(serialize(game))!;
    expect(cellAt(state.grid, P(2, 2))).toBeNull();
  });

  it("round-trips a bigint score beyond Number.MAX_SAFE_INTEGER", () => {
    const game = new Game({ initialGrid: gridOf(1, {}) });
    const big = 9_999_999_999_999_999_999n;
    const json = serialize({ grid: game.grid, score: big, reachedTier: 7 });
    expect(deserialize(json)!.score).toBe(big);
  });
});

describe("Game.restore", () => {
  it("reproduces a game through serialize -> deserialize -> restore", () => {
    const src = new Game({ initialGrid: gridOf(2, { "0,0": 8, "0,1": 8 }) });
    src.pointer(P(0, 0));
    src.pointer(P(0, 1));
    src.commit();

    const restored = new Game({ initialGrid: gridOf(1, {}) });
    restored.restore(deserialize(serialize(src))!);

    expect(restored.score).toBe(src.score);
    expect(restored.reachedTier).toBe(src.reachedTier);
    expect(restored.grid).toEqual(src.grid);
    expect(restored.path).toEqual([]); // transient state reset
    expect(restored.targeting).toBeNull();
  });
});

describe("deserialize rejects bad input", () => {
  it("returns null for non-JSON", () => {
    expect(deserialize("not json{")).toBeNull();
  });
  it("returns null for a mismatched save version", () => {
    const stale = JSON.stringify({ version: SAVE_VERSION + 1, grid: [], score: "0", reachedTier: 1 });
    expect(deserialize(stale)).toBeNull();
  });
  it("returns null for a grid of the wrong dimensions", () => {
    const wrong = JSON.stringify({
      version: SAVE_VERSION,
      grid: [[null]],
      score: "0",
      reachedTier: 1,
    });
    expect(deserialize(wrong)).toBeNull();
  });
});
