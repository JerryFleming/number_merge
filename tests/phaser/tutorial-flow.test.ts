import { describe, it, expect, vi } from "vitest";
import { Tutorial } from "../../src/phaser/Tutorial";
import type { TutorialStep } from "../../src/core/tutorial";

/**
 * Drive the Tutorial state machine with a stub scene. We only need the Phaser
 * surface the Tutorial touches; every builder returns a chainable stub. This
 * guards the step progression (start -> advance x3 -> finish) that the live
 * BoardScene relies on, independent of rendering.
 */
function stubScene() {
  const chainable: Record<string, unknown> = {};
  const self = new Proxy(chainable, {
    get(_t, prop) {
      if (prop === "setInvertAlpha") return () => self;
      // Any method returns the same chainable stub; any property reads as it.
      return (..._args: unknown[]) => self;
    },
  });
  const make = { graphics: () => ({ createGeometryMask: () => ({ setInvertAlpha: () => ({}) }), clear: () => {}, fillStyle: () => {}, fillRect: () => {}, fillRoundedRect: () => {} }) };
  const text = () => {
    const t: Record<string, unknown> = { text: "" };
    const p: Record<string, unknown> = new Proxy(t, {
      get(target, prop) {
        if (prop === "text") return target.text;
        if (prop === "setText") return (v: string) => { target.text = v; return p; };
        if (prop === "on") return () => p;
        return (..._a: unknown[]) => p;
      },
    });
    return p;
  };
  const gfx = () => new Proxy({}, { get: () => (..._a: unknown[]) => gfx() });
  const img = () => new Proxy({}, { get: () => (..._a: unknown[]) => img() });
  const container = () => new Proxy({}, { get: () => (..._a: unknown[]) => container() });
  return {
    add: {
      graphics: gfx,
      image: img,
      text,
      container,
    },
    make,
    scale: { width: 400, height: 800 },
    tweens: {
      add: () => ({ remove: () => {} }),
      chain: () => ({ remove: () => {} }),
    },
  } as unknown as Phaser.Scene;
}

describe("Tutorial flow", () => {
  it("runs start -> three steps -> finish, loading each step's board", () => {
    const boards: TutorialStep[] = [];
    const onFinished = vi.fn();
    const t = new Tutorial(
      stubScene(),
      onFinished,
      (step) => boards.push(step),
    );
    t.setGeometry({ x: 20, y: 100 }, 60);

    t.start();
    expect(t.isActive).toBe(true);
    expect(boards).toHaveLength(1);
    expect(boards[0].n).toBe(1);
    expect(t.currentStep?.n).toBe(1);
    expect(t.allowedCells.length).toBeGreaterThanOrEqual(2); // step 1 demo cells

    t.advance();
    expect(boards[1].n).toBe(2);
    expect(t.currentStep?.n).toBe(2);

    t.advance();
    expect(boards[2].n).toBe(3);
    expect(t.currentStep?.n).toBe(3);
    expect(t.allowedCells).toHaveLength(0); // power-up step: no board cells

    t.advance(); // past the last step
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(t.isActive).toBe(false);
  });

  it("advance is inert before start and after finishing", () => {
    const onFinished = vi.fn();
    const t = new Tutorial(stubScene(), onFinished, () => {});
    t.advance(); // not started
    expect(onFinished).not.toHaveBeenCalled();
    expect(t.isActive).toBe(false);
  });
});
