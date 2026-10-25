import { COLS, ROWS, type Cell, type Grid, type Pos } from "./types";

/** Build a grid by calling `fill` for every position. */
export function createGrid(fill: (pos: Pos) => Cell | null): Grid {
  const grid: Grid = [];
  for (let row = 0; row < ROWS; row++) {
    const r: (Cell | null)[] = [];
    for (let col = 0; col < COLS; col++) {
      r.push(fill({ col, row }));
    }
    grid.push(r);
  }
  return grid;
}

export function inBounds(pos: Pos): boolean {
  return pos.col >= 0 && pos.col < COLS && pos.row >= 0 && pos.row < ROWS;
}

export function cellAt(grid: Grid, pos: Pos): Cell | null {
  if (!inBounds(pos)) return null;
  return grid[pos.row][pos.col];
}

/** Up to 8 in-bounds orthogonal + diagonal neighbors. */
export function neighbors8(pos: Pos): Pos[] {
  const out: Pos[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const n = { col: pos.col + dc, row: pos.row + dr };
      if (inBounds(n)) out.push(n);
    }
  }
  return out;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.col === b.col && a.row === b.row;
}
