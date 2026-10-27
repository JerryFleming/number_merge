import { createGrid } from "./board";
import { COLS, ROWS, type Grid, type Pos } from "./types";

/**
 * First-run tutorial data. The original game shows a 3-step interactive
 * tutorial (TutorialStates First/Second/Third) in which each step regenerates
 * its own scripted "tutorial blocks" (GenerateTutorialStep), dims the rest of
 * the board, and animates a hand dragging across the demo blocks until the
 * player performs the move. We mirror that: each step has a scripted board and
 * a demo drag path, and we reload the step's board when the step begins.
 *
 * Step boards are hand-built so the demonstrated drag is always valid under the
 * real rules (connect = equal tier, or +1 vs the previous block once the chain
 * is >= 2). Keeping this in the pure core keeps it deterministic and testable.
 */

export interface TutorialStep {
  /** 1-based step number shown to the player. */
  readonly n: number;
  readonly title: string;
  readonly description: string;
  /** The scripted board this step starts from. */
  readonly grid: Grid;
  /** The cells the demo hand drags across, in order (empty for the power-up
   * step, which points at the power bar instead of the board). */
  readonly demo: readonly Pos[];
  /** How this step completes: a valid board merge, or tapping any power-up. */
  readonly completeOn: "merge" | "powerup";
}

/** Fill the board with a calm backdrop of tier-1 blocks, then stamp specific
 * cells. The backdrop makes the board read as a real game while the demo cells
 * stand out once the rest is dimmed by the tutorial mask. */
function boardWith(stamp: ReadonlyArray<readonly [Pos, number]>): Grid {
  const grid = createGrid(() => ({ tier: 1 }));
  for (const [pos, tier] of stamp) grid[pos.row][pos.col] = { tier };
  return grid;
}

const BOTTOM = ROWS - 1; // row 6
const MID = Math.floor(COLS / 2); // col 2

/** Step 1 — merge two equal blocks. Two adjacent tier-2 (value 4) blocks on
 * the bottom row; dragging across them merges to an 8. */
function step1(): TutorialStep {
  const a: Pos = { col: MID - 1, row: BOTTOM };
  const b: Pos = { col: MID, row: BOTTOM };
  return {
    n: 1,
    title: "Merge equal blocks",
    description: "Drag across blocks with the same number to merge them.",
    grid: boardWith([
      [a, 2],
      [b, 2],
    ]),
    demo: [a, b],
    completeOn: "merge",
  };
}

/** Step 2 — chain into a higher block. Equal first (4, 4), then one tier up
 * (8): once the chain is >= 2 the next block may be +1. 4 -> 4 -> 8 merges. */
function step2(): TutorialStep {
  const a: Pos = { col: MID - 1, row: BOTTOM };
  const b: Pos = { col: MID, row: BOTTOM };
  const c: Pos = { col: MID + 1, row: BOTTOM };
  return {
    n: 2,
    title: "Chain into a bigger block",
    description: "After two equal blocks, you can reach for the next number up.",
    grid: boardWith([
      [a, 2],
      [b, 2],
      [c, 3],
    ]),
    demo: [a, b, c],
    completeOn: "merge",
  };
}

/** Step 3 — power-ups. Points at the power bar (no board drag); completes when
 * the player taps any power-up. The board is a normal demonstrable layout. */
function step3(): TutorialStep {
  const a: Pos = { col: MID - 1, row: BOTTOM };
  const b: Pos = { col: MID, row: BOTTOM };
  return {
    n: 3,
    title: "Use a power-up",
    description: "Stuck? Tap a power-up below to break, gather, or swap blocks.",
    grid: boardWith([
      [a, 2],
      [b, 3],
    ]),
    demo: [],
    completeOn: "powerup",
  };
}

/** The ordered tutorial steps. Built fresh each call so grids aren't shared. */
export function tutorialSteps(): TutorialStep[] {
  return [step1(), step2(), step3()];
}

export const TUTORIAL_STEP_COUNT = 3;
