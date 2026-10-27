import Phaser from "phaser";
import type { Pos } from "../core/types";
import { tutorialSteps, type TutorialStep } from "../core/tutorial";
import { cellCenter, bottomInset, POWER_BAR_H, type Point } from "./layout";
import { COLORS } from "./theme";
import { TEX } from "./assets";

/**
 * First-run interactive tutorial, modelled on the original game's 3-step
 * tutorial (TutorialStates First/Second/Third -> Completed). Each step dims the
 * board except the demo cells (a spotlight mask), shows a title + description,
 * and loops a pointing hand across the demo cells to demonstrate the drag,
 * waiting for the player to perform the move before advancing.
 *
 * It owns no game rules: the scene loads each step's scripted board, restricts
 * input to the demo cells, and tells the tutorial when a step was completed.
 */
export class Tutorial {
  private steps: TutorialStep[] = tutorialSteps();
  private index = -1;
  private active = false;

  private container: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Graphics;
  private holeMaskG: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private hand: Phaser.GameObjects.Image;
  private title: Phaser.GameObjects.Text;
  private desc: Phaser.GameObjects.Text;
  private stepLabel: Phaser.GameObjects.Text;
  private skip: Phaser.GameObjects.Text;

  private handTween?: Phaser.Tweens.Tween | Phaser.Tweens.TweenChain;

  // Board geometry, kept in sync by the scene via setGeometry().
  private origin: Point = { x: 0, y: 0 };
  private size = 0;

  constructor(
    private scene: Phaser.Scene,
    /** Called when the player finishes (or skips) the whole tutorial. */
    private onFinished: () => void,
    /** Called when a step begins, so the scene can load its scripted board. */
    private onStepBoard: (step: TutorialStep) => void,
  ) {
    this.dim = scene.add.graphics();
    // The dim covers the screen except holes over the demo cells: a separate
    // graphics drives an inverted geometry mask (shown where NOT drawn).
    this.holeMaskG = scene.make.graphics({});
    const mask = this.holeMaskG.createGeometryMask();
    mask.setInvertAlpha(true);
    this.dim.setMask(mask);

    this.ring = scene.add.graphics();

    this.hand = scene.add
      .image(0, 0, TEX.hand)
      // The sprite's pivot sits near the fingertip (Unity pivot ~0.35, 0.89).
      .setOrigin(0.32, 0.12)
      .setDepth(2);

    this.title = scene.add
      .text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#ffd166",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: scene.scale.width - 64 },
      })
      .setOrigin(0.5);
    this.desc = scene.add
      .text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: COLORS.text,
        align: "center",
        wordWrap: { width: scene.scale.width - 64 },
      })
      .setOrigin(0.5);
    this.stepLabel = scene.add
      .text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: "#9aa3b2",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    // A padded pill. Centered origin + an explicit hit rectangle sized to the
    // text gives a hit area that reliably lines up with what's drawn (origin
    // (1,0.5) previously left the hit box offset from the glyphs).
    this.skip = scene.add
      .text(0, 0, "Skip  ✕", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold",
        backgroundColor: "#2a3346",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const skipHandler = (
      _p?: Phaser.Input.Pointer,
      _x?: number,
      _y?: number,
      e?: Phaser.Types.Input.EventData,
    ) => {
      e?.stopPropagation?.();
      this.finish();
    };
    // pointerup is the reliable "tap" on touch; keep pointerdown too.
    this.skip.on("pointerup", skipHandler);
    this.skip.on("pointerdown", skipHandler);

    this.container = scene.add.container(0, 0, [
      this.dim,
      this.ring,
      this.hand,
      this.stepLabel,
      this.title,
      this.desc,
    ]);
    this.container.setDepth(1100).setVisible(false);
    // Skip stays OUT of the container and at a higher depth: a top-level
    // interactive object gets a world-space hit area, avoiding container
    // input-transform quirks that can make it unclickable.
    this.skip.setDepth(1200).setVisible(false);
  }

  get isActive(): boolean {
    return this.active;
  }

  /** The cells the current step allows the player to interact with (empty for
   * the power-up step, where the whole board is inert and the power bar drives
   * completion). */
  get allowedCells(): readonly Pos[] {
    const s = this.steps[this.index];
    return s ? s.demo : [];
  }

  get currentStep(): TutorialStep | null {
    return this.steps[this.index] ?? null;
  }

  /** If the pointer is within the Skip pill, end the tutorial and return true.
   * The scene calls this from its own (always-firing) pointer handler, so Skip
   * works even if the GameObject-level input misses the tap. */
  tryTapSkip(x: number, y: number): boolean {
    if (!this.active || !this.skip.visible) return false;
    const b = this.skip.getBounds();
    // A little slop around the pill for comfortable tapping.
    if (
      x >= b.x - 8 &&
      x <= b.right + 8 &&
      y >= b.y - 8 &&
      y <= b.bottom + 8
    ) {
      this.finish();
      return true;
    }
    return false;
  }

  /** Keep the overlay aligned with the board after layout/resize. */
  setGeometry(origin: Point, size: number): void {
    this.origin = origin;
    this.size = size;
    if (this.active) this.renderStep();
  }

  /** Begin the tutorial from step 1. */
  start(): void {
    this.active = true;
    this.index = 0;
    this.container.setVisible(true);
    this.skip.setVisible(true);
    this.beginStep();
  }

  /** Advance to the next step, or finish after the last one. Called by the
   * scene once the current step's completion condition is met. */
  advance(): void {
    if (!this.active) return;
    if (this.index >= this.steps.length - 1) {
      this.finish();
      return;
    }
    this.index++;
    this.beginStep();
  }

  private beginStep(): void {
    const step = this.steps[this.index];
    if (!step) return;
    this.onStepBoard(step); // scene loads this step's scripted board + redraws
    this.renderStep();
  }

  /** Lay out and (re)draw the overlay for the current step. */
  private renderStep(): void {
    const step = this.steps[this.index];
    if (!step || this.size === 0) return;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    // Dim everything; punch holes over the demo cells (or the whole board for
    // the power-up step, so the player can see the board while it points down).
    this.dim.clear();
    this.dim.fillStyle(0x000000, 0.68);
    this.dim.fillRect(0, 0, w, h);

    this.holeMaskG.clear();
    this.holeMaskG.fillStyle(0xffffff, 1);
    this.ring.clear();
    const inset = this.size * 0.06;
    const s = this.size - inset * 2;
    const r = s * 0.18;
    for (const p of step.demo) {
      const c = cellCenter(p, this.origin, this.size);
      this.holeMaskG.fillRoundedRect(c.x - s / 2, c.y - s / 2, s, s, r);
      this.ring.lineStyle(4, 0xffd166, 0.95);
      this.ring.strokeRoundedRect(c.x - s / 2, c.y - s / 2, s, s, r);
    }
    // Power-up step: spotlight the power bar instead of board cells so the
    // hand points at a lit bar, and outline it.
    if (step.completeOn === "powerup") {
      const barH = POWER_BAR_H + bottomInset();
      const barY = h - barH;
      this.holeMaskG.fillRect(0, barY, w, barH);
      this.ring.lineStyle(4, 0xffd166, 0.95);
      this.ring.strokeRect(6, barY + 4, w - 12, POWER_BAR_H - 8);
    }

    // Text banner, placed in the dimmed area above the board.
    const bannerY = Math.max(this.origin.y - this.size * 1.1, 76);
    this.stepLabel
      .setText(`STEP ${step.n} / ${this.steps.length}`)
      .setPosition(w / 2, bannerY - 26);
    this.title.setPosition(w / 2, bannerY + 2);
    this.desc.setPosition(w / 2, bannerY + 34);
    // Centered origin: offset by half-size to keep the pill in the top-right.
    this.skip.setPosition(w - 16 - this.skip.width / 2, 24 + this.skip.height / 2);
    if (this.title.text !== step.title) this.title.setText(step.title);
    if (this.desc.text !== step.description) this.desc.setText(step.description);

    this.startHand(step);
  }

  /** Loop the pointing hand: for a drag step, run it along the demo cells; for
   * the power-up step, bob it at the bottom pointing down toward the bar. */
  private startHand(step: TutorialStep): void {
    this.handTween?.remove();
    this.hand.setDisplaySize(this.size * 0.78, this.size * 0.78 * (250 / 171));
    this.hand.setAngle(0).setAlpha(1);

    if (step.demo.length >= 2) {
      const pts = step.demo.map((p) => cellCenter(p, this.origin, this.size));
      // Place at the first cell, then tween through the rest and loop.
      this.hand.setPosition(pts[0].x, pts[0].y);
      this.handTween = this.scene.tweens.chain({
        targets: this.hand,
        loop: -1,
        tweens: [
          // Tap down at the start.
          { scale: this.hand.scale * 0.88, duration: 140, yoyo: true, ease: "Quad.Out" },
          ...pts.slice(1).map((pt) => ({
            x: pt.x,
            y: pt.y,
            duration: 520,
            ease: "Sine.InOut",
          })),
          { alpha: 0.2, duration: 220, delay: 180 },
          // Jump back to the start (invisible) before looping.
          {
            x: pts[0].x,
            y: pts[0].y,
            alpha: 1,
            duration: 1,
            delay: 160,
          },
        ],
      });
    } else {
      // Power-up step: hover the hand just above the power bar, bobbing toward
      // it so the fingertip reads as pointing at the buttons below.
      const h = this.scene.scale.height;
      const x = this.scene.scale.width / 2;
      const barTop = h - (POWER_BAR_H + bottomInset());
      const y0 = barTop - this.size * 0.95;
      this.hand.setPosition(x, y0);
      this.handTween = this.scene.tweens.add({
        targets: this.hand,
        y: y0 + this.size * 0.3,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }
  }

  /** Flash the demo cells red briefly when the player makes a wrong move (the
   * original's "detect block item failed" feedback). */
  flashWrong(): void {
    this.scene.tweens.add({
      targets: this.ring,
      alpha: { from: 1, to: 0.2 },
      duration: 120,
      yoyo: true,
      repeat: 2,
    });
  }

  private finish(): void {
    if (!this.active) return; // guard against a double tap (down + up)
    this.active = false;
    this.handTween?.remove();
    this.container.setVisible(false);
    this.skip.setVisible(false);
    this.dim.clear();
    this.ring.clear();
    this.onFinished();
  }
}
