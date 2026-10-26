import { describe, it, expect } from "vitest";
import { Game } from "../../src/core/game";
import { cellAt } from "../../src/core/board";
import { COLS, ROWS, type Cell, type Grid, type Pos } from "../../src/core/types";

const P = (col: number, row: number): Pos => ({ col, row });

function fixedRng(v = 0): () => number {
  return () => v;
}

/** A full grid where `special` positions carry their given tier, rest = `rest`. */
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

function fullBoard(game: Game): boolean {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (cellAt(game.grid, P(col, row)) === null) return false;
    }
  }
  return true;
}

describe("Game.startNew", () => {
  it("produces a full, solvable board with reset score and tier", () => {
    const game = new Game({ rng: fixedRng(0) });
    game.startNew();
    expect(fullBoard(game)).toBe(true);
    expect(game.score).toBe(0n);
    expect(game.reachedTier).toBe(1);
    expect(game.isOver).toBe(false);
  });
});

describe("Game drag + commit", () => {
  it("commits an equal pair: scores the total, places the merged block, refills", () => {
    // Two tier-3 blocks adjacent in column 0; the rest tier 9.
    const game = new Game({
      rng: fixedRng(0),
      initialGrid: gridOf(9, { "0,0": 3, "0,1": 3 }),
    });
    game.pointer(P(0, 0));
    game.pointer(P(0, 1));
    const result = game.commit();
    expect(result).not.toBeNull();
    expect(game.score).toBe(16n); // 2^3 + 2^3
    expect(game.reachedTier).toBe(4); // merged tier
    expect(fullBoard(game)).toBe(true); // consumed cells refilled
  });

  it("reports the merged block's resting position AFTER gravity", () => {
    // Column 0: tier-4 at rows 0,1,2; rows 3-6 empty. Rest of the board tier-9.
    const grid: Grid = [];
    for (let row = 0; row < ROWS; row++) {
      const r: (Cell | null)[] = [];
      for (let col = 0; col < COLS; col++) {
        if (col === 0) r.push(row <= 2 ? { tier: 4 } : null);
        else r.push({ tier: 9 });
      }
      grid.push(r);
    }
    const game = new Game({ rng: fixedRng(0), initialGrid: grid });
    game.pointer(P(0, 0));
    game.pointer(P(0, 1));
    game.pointer(P(0, 2));
    const result = game.commit()!;
    // total = 3 * 2^4 = 48 -> next pow2 is 64 = 2^6, landed (pre-gravity) at row 2.
    expect(result.tier).toBe(6);
    expect(result.landed).toEqual(P(0, 2));
    // After collapse the lone tier-6 block falls to the bottom row.
    expect(result.restingPos).toEqual(P(0, ROWS - 1));
    // And that cell really holds the merged block (refill range 1..4 can't make tier 6).
    expect(cellAt(game.grid, result.restingPos)).toEqual({ tier: 6 });
  });

  it("commits a 1-length path as a no-op (no score, path cleared)", () => {
    const game = new Game({ rng: fixedRng(0), initialGrid: gridOf(5, {}) });
    game.pointer(P(2, 2));
    const scoreBefore = game.score;
    const result = game.commit();
    expect(result).toBeNull();
    expect(game.score).toBe(scoreBefore);
    expect(game.path).toEqual([]);
  });
});

describe("Game.reachedTier is monotonic", () => {
  it("never decreases after a lower-tier merge following a higher one", () => {
    // First merge two tier-8 blocks -> reachedTier becomes 9.
    const game = new Game({
      rng: fixedRng(0),
      initialGrid: gridOf(2, { "0,0": 8, "0,1": 8 }),
    });
    game.pointer(P(0, 0));
    game.pointer(P(0, 1));
    game.commit();
    expect(game.reachedTier).toBe(9);

    // Now a tier-1 pair merge (result tier 2) must not lower reachedTier.
    game.loadGrid(gridOf(5, { "0,0": 1, "0,1": 1 }));
    game.pointer(P(0, 0));
    game.pointer(P(0, 1));
    game.commit();
    expect(game.reachedTier).toBe(9);
  });
});

describe("Game power-up targeting vs drag", () => {
  it("ignores pointer() while targeting mode is active", () => {
    const game = new Game({ rng: fixedRng(0), initialGrid: gridOf(5, {}) });
    game.enterTargeting("hammer");
    game.pointer(P(0, 0));
    expect(game.path).toEqual([]);
  });

  it("begins a drag once targeting is cancelled", () => {
    const game = new Game({ rng: fixedRng(0), initialGrid: gridOf(5, {}) });
    game.enterTargeting("hammer");
    game.cancelTargeting();
    game.pointer(P(0, 0));
    expect(game.path.length).toBe(1);
  });

  it("applies a power-up and recomputes board/game-over", () => {
    const game = new Game({
      rng: fixedRng(0),
      initialGrid: gridOf(5, { "2,2": 7 }),
    });
    game.enterTargeting("hammer");
    const changed = game.useHammer(P(2, 2));
    expect(changed).toBe(true);
    expect(fullBoard(game)).toBe(true); // hammer then collapse+refill
    expect(game.targeting).toBeNull(); // targeting ends after use
  });
});

describe("Game power-up use counts", () => {
  it("starts every power-up at zero uses", () => {
    const game = new Game({ rng: fixedRng(0), initialGrid: gridOf(5, {}) });
    expect(game.useCounts).toEqual({ hammer: 0, magnet: 0, swap: 0 });
  });

  it("increments the count each time a power-up is applied", () => {
    const game = new Game({
      rng: fixedRng(0),
      initialGrid: gridOf(5, { "2,2": 7, "0,0": 3, "4,4": 3 }),
    });
    game.useHammer(P(2, 2));
    game.useHammer(P(0, 1));
    game.useSwap(P(1, 1), P(3, 3));
    expect(game.useCounts).toEqual({ hammer: 2, magnet: 0, swap: 1 });
  });

  it("does not count a magnet that is rejected (singleton tier)", () => {
    // Only one block of tier 9 exists, so magnet is not usable there.
    const game = new Game({
      rng: fixedRng(0),
      initialGrid: gridOf(5, { "2,2": 9 }),
    });
    const changed = game.useMagnet(P(2, 2));
    expect(changed).toBe(false);
    expect(game.useCounts.magnet).toBe(0);
  });

  it("resets counts on a new game", () => {
    const game = new Game({
      rng: fixedRng(0),
      initialGrid: gridOf(5, { "2,2": 7 }),
    });
    game.useHammer(P(2, 2));
    game.startNew();
    expect(game.useCounts).toEqual({ hammer: 0, magnet: 0, swap: 0 });
  });
});
