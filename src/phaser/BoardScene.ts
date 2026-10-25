import Phaser from "phaser";
import { Game } from "../core/game";
import { cellAt } from "../core/board";
import { magnetUsable } from "../core/powerups";
import { COLS, ROWS, type Pos } from "../core/types";
import {
  cellCenter,
  cellSize,
  gridOrigin,
  posFromPixel,
  SCORE_H,
  type Point,
} from "./layout";
import { COLORS, tierColor, tierLabel } from "./theme";
import { PowerBar } from "./PowerBar";
import { GameOverOverlay } from "./GameOver";

/**
 * Renders the board from the Game's state, drives the retractable drag, and
 * animates merges. All rules live in Game; the scene only reads state and
 * sends pointer / power-up intents.
 */
export class BoardScene extends Phaser.Scene {
  private model!: Game;
  private size = 0;
  private origin: Point = { x: 0, y: 0 };

  private cellLayer!: Phaser.GameObjects.Container;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private dragging = false;

  private powerBar!: PowerBar;
  private gameOver!: GameOverOverlay;

  // Swap needs two taps; hold the first here.
  private swapFirst: Pos | null = null;

  constructor() {
    super("board");
  }

  create(): void {
    this.model = new Game();
    this.computeLayout();

    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.cellLayer = this.add.container(0, 0);
    this.lineGfx = this.add.graphics();

    this.scoreText = this.add
      .text(this.scale.width / 2, SCORE_H / 2, "0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: COLORS.text,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.powerBar = new PowerBar(this, (p) => this.onPowerSelected(p));
    this.gameOver = new GameOverOverlay(this, () => this.restart());

    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.scale.on("resize", this.onResize, this);

    this.redraw();
  }

  private computeLayout(): void {
    this.size = cellSize(this.scale.width, this.scale.height);
    this.origin = gridOrigin(this.scale.width, this.scale.height, this.size);
  }

  private onResize(): void {
    this.computeLayout();
    this.scoreText?.setX(this.scale.width / 2);
    this.powerBar?.layout();
    this.gameOver?.layout();
    this.redraw();
  }

  // --- input --------------------------------------------------------------

  private pointerToPos(pointer: Phaser.Input.Pointer): Pos | null {
    return posFromPixel(pointer.x, pointer.y, this.origin, this.size);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.model.isOver) return;
    const pos = this.pointerToPos(pointer);
    if (!pos) return;

    // Power-up targeting takes priority over starting a drag.
    if (this.model.targeting) {
      this.handleTargetTap(pos);
      return;
    }
    this.dragging = true;
    this.model.pointer(pos);
    this.redraw();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging || this.model.targeting) return;
    const pos = this.pointerToPos(pointer);
    if (!pos) return;
    const before = this.model.path.length;
    this.model.pointer(pos);
    if (this.model.path.length !== before) this.redraw();
  }

  private onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    const result = this.model.commit();
    if (result) {
      this.animateMerge(result.restingPos);
    } else {
      this.redraw();
    }
    this.scoreText.setText(this.model.score.toString());
    this.checkGameOver();
  }

  // --- power-ups ----------------------------------------------------------

  private onPowerSelected(power: "hammer" | "magnet" | "swap"): void {
    if (this.model.isOver) return;
    if (this.model.targeting === power) {
      this.model.cancelTargeting();
    } else {
      this.model.enterTargeting(power);
    }
    this.swapFirst = null;
    this.redraw();
  }

  private handleTargetTap(pos: Pos): void {
    const power = this.model.targeting;
    if (!power) return;
    if (power === "hammer") {
      this.model.useHammer(pos);
    } else if (power === "magnet") {
      const ok = this.model.useMagnet(pos);
      if (!ok) {
        this.flashInvalid(pos);
        return; // not consumed; stay in targeting
      }
    } else if (power === "swap") {
      if (!this.swapFirst) {
        this.swapFirst = pos;
        this.redraw();
        return;
      }
      this.model.useSwap(this.swapFirst, pos);
      this.swapFirst = null;
    }
    this.powerBar.clearActive();
    this.scoreText.setText(this.model.score.toString());
    this.redraw();
    this.checkGameOver();
  }

  private restart(): void {
    this.model.startNew();
    this.gameOver.hide();
    this.swapFirst = null;
    this.scoreText.setText("0");
    this.redraw();
  }

  private checkGameOver(): void {
    if (this.model.isOver) this.gameOver.show(this.model.score);
  }

  // --- rendering ----------------------------------------------------------

  private redraw(): void {
    this.cellLayer.removeAll(true);
    const pathKeys = new Set(this.model.path.map((p) => `${p.col},${p.row}`));
    const swapKey = this.swapFirst
      ? `${this.swapFirst.col},${this.swapFirst.row}`
      : null;
    const targeting = this.model.targeting;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const pos: Pos = { col, row };
        const c = cellAt(this.model.grid, pos);
        const center = cellCenter(pos, this.origin, this.size);
        const inset = this.size * 0.06;
        const s = this.size - inset * 2;

        const rect = this.add.graphics();
        const fill = c ? tierColor(c.tier) : COLORS.cellEmpty;
        rect.fillStyle(fill, 1);
        rect.fillRoundedRect(center.x - s / 2, center.y - s / 2, s, s, s * 0.18);

        const key = `${col},${row}`;
        if (pathKeys.has(key) || key === swapKey) {
          rect.lineStyle(4, COLORS.selected, 1);
          rect.strokeRoundedRect(
            center.x - s / 2,
            center.y - s / 2,
            s,
            s,
            s * 0.18,
          );
        }
        // During Magnet targeting, dim tiers that can't be gathered (< 2 on board).
        if (targeting === "magnet" && c && !this.magnetEligible(pos)) {
          rect.fillStyle(0x000000, 0.45);
          rect.fillRoundedRect(
            center.x - s / 2,
            center.y - s / 2,
            s,
            s,
            s * 0.18,
          );
        }
        this.cellLayer.add(rect);

        if (c) {
          const label = this.add
            .text(center.x, center.y, tierLabel(c.tier), {
              fontFamily: "system-ui, sans-serif",
              fontSize: `${Math.floor(this.size * 0.34)}px`,
              color: COLORS.text,
              fontStyle: "bold",
            })
            .setOrigin(0.5);
          this.cellLayer.add(label);
        }
      }
    }
    this.drawPathLine();
  }

  private drawPathLine(): void {
    this.lineGfx.clear();
    const path = this.model.path;
    if (path.length < 2) return;
    this.lineGfx.lineStyle(Math.max(6, this.size * 0.12), COLORS.line, 0.9);
    this.lineGfx.beginPath();
    path.forEach((p, i) => {
      const c = cellCenter(p, this.origin, this.size);
      if (i === 0) this.lineGfx.moveTo(c.x, c.y);
      else this.lineGfx.lineTo(c.x, c.y);
    });
    this.lineGfx.strokePath();
  }

  private animateMerge(landed: Pos): void {
    this.redraw();
    // Pop the landed block: find and scale-bounce it.
    const center = cellCenter(landed, this.origin, this.size);
    const target = this.cellLayer.list.find(
      (o) =>
        o instanceof Phaser.GameObjects.Text &&
        Math.abs((o as Phaser.GameObjects.Text).x - center.x) < 1 &&
        Math.abs((o as Phaser.GameObjects.Text).y - center.y) < 1,
    ) as Phaser.GameObjects.Text | undefined;
    if (target) {
      target.setScale(0.1);
      this.tweens.add({
        targets: target,
        scale: 1,
        ease: "Back.Out",
        duration: 220,
      });
    }
  }

  private magnetEligible(pos: Pos): boolean {
    return magnetUsable(this.model.grid, pos);
  }

  private flashInvalid(pos: Pos): void {
    const center = cellCenter(pos, this.origin, this.size);
    const ring = this.add.graphics();
    ring.lineStyle(4, 0xff5555, 1);
    ring.strokeCircle(center.x, center.y, this.size * 0.4);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 350,
      onComplete: () => ring.destroy(),
    });
  }
}
