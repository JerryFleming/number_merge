import { applyPointer } from "./connect";
import { collapseColumns, refill } from "./gravity";
import { resolveMerge, type MergeResult } from "./merge";
import { hasAnyMove } from "./moves";
import { hammer, magnet, magnetUsable, swap } from "./powerups";
import { seedBoard } from "./seed";
import { spawnRange } from "./spawn";
import { COLS, ROWS, type Cell, type Grid, type Pos, type Tier } from "./types";

export type PowerUp = "hammer" | "magnet" | "swap";

export interface GameOptions {
  rng?: () => number;
  /** Start from a specific board instead of a random solvable seed. */
  initialGrid?: Grid;
}

/**
 * The game facade: owns the board, the current drag path, the score, the
 * highest tier reached, game-over state, and power-up targeting. Pure logic —
 * no rendering. The presentation layer reads state and calls these methods.
 */
export class Game {
  private _grid: Grid;
  private _path: Pos[] = [];
  private _score = 0n;
  private _reachedTier: Tier = 1;
  private _over = false;
  private _targeting: PowerUp | null = null;
  private readonly rng: () => number;

  constructor(opts: GameOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this._grid = opts.initialGrid
      ? opts.initialGrid.map((r) => r.slice())
      : seedBoard(this.rng, hasAnyMove);
    this.recomputeOver();
  }

  get grid(): Grid {
    return this._grid;
  }
  get path(): Pos[] {
    return this._path;
  }
  get score(): bigint {
    return this._score;
  }
  get reachedTier(): Tier {
    return this._reachedTier;
  }
  get isOver(): boolean {
    return this._over;
  }
  get targeting(): PowerUp | null {
    return this._targeting;
  }

  /** Reset to a fresh, solvable random board. */
  startNew(): void {
    this._grid = seedBoard(this.rng, hasAnyMove);
    this._path = [];
    this._score = 0n;
    this._reachedTier = 1;
    this._targeting = null;
    this.recomputeOver();
  }

  /** Replace the board (e.g. for scripted setups); clears the path. */
  loadGrid(grid: Grid): void {
    this._grid = grid.map((r) => r.slice());
    this._path = [];
    this.recomputeOver();
  }

  // --- drag ---------------------------------------------------------------

  /** Update the drag path for the block under the pointer. Inert while targeting. */
  pointer(pos: Pos): void {
    if (this._targeting) return;
    this._path = applyPointer(this._grid, this._path, pos);
  }

  /** Commit the current drag: merge if valid (>= 2), else clear the path. */
  commit(): MergeResult | null {
    const result = resolveMerge(this._grid, this._path);
    if (!result) {
      this._path = [];
      return null;
    }
    // Clear consumed cells, place the merged block at the landed cell. Keep a
    // reference to the exact merged-block object so we can find where gravity
    // leaves it (collapse moves references; refill only fills nulls with new
    // objects, so identity uniquely locates the merged block afterwards).
    const mergedBlock: Cell = { tier: result.tier };
    const next = this._grid.map((r) => r.slice());
    for (const p of result.consumed) next[p.row][p.col] = null;
    next[result.landed.row][result.landed.col] = mergedBlock;
    this._grid = next;
    this._score += result.score;
    if (result.tier > this._reachedTier) this._reachedTier = result.tier;
    this.settleBoard();
    this._path = [];
    return { ...result, restingPos: this.findBlock(mergedBlock) ?? result.landed };
  }

  // --- power-ups ----------------------------------------------------------

  enterTargeting(power: PowerUp): void {
    this._path = [];
    this._targeting = power;
  }
  cancelTargeting(): void {
    this._targeting = null;
  }

  useHammer(target: Pos): boolean {
    this._grid = hammer(this._grid, target);
    this.settleBoard();
    this._targeting = null;
    return true;
  }

  /** Returns false (no change) when the tapped tier is a singleton. */
  useMagnet(target: Pos): boolean {
    if (!magnetUsable(this._grid, target)) return false;
    const out = magnet(this._grid, target);
    if (!out) return false;
    this._grid = out;
    this.settleBoard();
    this._targeting = null;
    return true;
  }

  useSwap(a: Pos, b: Pos): boolean {
    // Swap does not shift or refill: positions just exchange.
    this._grid = swap(this._grid, a, b);
    this._targeting = null;
    this.recomputeOver();
    return true;
  }

  // --- internals ----------------------------------------------------------

  /** Locate a specific block object on the board by identity, or null. */
  private findBlock(block: Cell): Pos | null {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this._grid[row][col] === block) return { col, row };
      }
    }
    return null;
  }

  private settleBoard(): void {
    this._grid = collapseColumns(this._grid);
    this._grid = refill(this._grid, spawnRange(this._reachedTier), this.rng);
    this.recomputeOver();
  }

  private recomputeOver(): void {
    this._over = !hasAnyMove(this._grid);
  }
}
