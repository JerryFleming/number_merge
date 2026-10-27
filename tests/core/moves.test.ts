import { describe, it, expect } from "vitest";
import { findAnyMove, hasAnyMove } from "../../src/core/moves";
import { cellAt, createGrid, neighbors8, samePos } from "../../src/core/board";
import type { Grid } from "../../src/core/types";

describe("hasAnyMove", () => {
  it("is true when some adjacent pair shares a tier", () => {
    // Two tier-3 blocks side by side; everything else distinct.
    const grid = createGrid((p) => {
      if (p.col === 0 && p.row === 0) return { tier: 3 };
      if (p.col === 1 && p.row === 0) return { tier: 3 };
      // fill the rest so no other equal adjacency exists
      return { tier: 100 + p.col + p.row * 10 };
    });
    expect(hasAnyMove(grid)).toBe(true);
  });

  it("is false when no adjacent pair is equal, even if +1 pairs exist", () => {
    // A board where each cell's tier is unique and neighbors never match,
    // but +1 steps do exist (they don't count: the opening pair must be equal).
    const grid: Grid = createGrid((p) => ({ tier: p.col + p.row * 7 + 1 }));
    expect(hasAnyMove(grid)).toBe(false);
  });

  it("is false on an empty board", () => {
    expect(hasAnyMove(createGrid(() => null))).toBe(false);
  });
});

describe("findAnyMove", () => {
  it("returns an adjacent equal pair when one exists", () => {
    const grid = createGrid((p) => {
      if (p.col === 0 && p.row === 0) return { tier: 3 };
      if (p.col === 1 && p.row === 0) return { tier: 3 };
      return { tier: 100 + p.col + p.row * 10 };
    });
    const pair = findAnyMove(grid);
    expect(pair).not.toBeNull();
    const [a, b] = pair!;
    // The two returned cells are adjacent and share a tier.
    expect(neighbors8(a).some((n) => samePos(n, b))).toBe(true);
    expect(cellAt(grid, a)!.tier).toBe(cellAt(grid, b)!.tier);
  });

  it("returns null when there are no moves", () => {
    const grid: Grid = createGrid((p) => ({ tier: p.col + p.row * 7 + 1 }));
    expect(findAnyMove(grid)).toBeNull();
  });
});
