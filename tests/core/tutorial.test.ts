import { describe, it, expect } from "vitest";
import { tutorialSteps, TUTORIAL_STEP_COUNT } from "../../src/core/tutorial";
import { resolveMerge } from "../../src/core/merge";
import { applyPointer } from "../../src/core/connect";
import { cellAt } from "../../src/core/board";
import { COLS, ROWS } from "../../src/core/types";

describe("tutorial steps", () => {
  const steps = tutorialSteps();

  it("has the expected number of steps", () => {
    expect(steps).toHaveLength(TUTORIAL_STEP_COUNT);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3]);
  });

  it("each step's grid is full-sized", () => {
    for (const s of steps) {
      expect(s.grid).toHaveLength(ROWS);
      for (const row of s.grid) expect(row).toHaveLength(COLS);
    }
  });

  it("demo cells are non-empty blocks on the board", () => {
    for (const s of steps) {
      for (const p of s.demo) expect(cellAt(s.grid, p)).not.toBeNull();
    }
  });

  it("the merge steps' demo paths are valid and resolve to a merge", () => {
    for (const s of steps.filter((x) => x.completeOn === "merge")) {
      // Replay the demo drag through the real connect rule.
      let path: typeof s.demo = [];
      for (const p of s.demo) {
        const next = applyPointer(s.grid, path as never, p);
        expect(next.length).toBe((path as never[]).length + 1); // each link accepted
        path = next;
      }
      expect(resolveMerge(s.grid, path as never)).not.toBeNull();
    }
  });

  it("the power-up step completes on a power-up, not a drag", () => {
    const last = steps[steps.length - 1];
    expect(last.completeOn).toBe("powerup");
    expect(last.demo).toHaveLength(0);
  });
});
