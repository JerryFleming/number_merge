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
import { WebAudioSfx, type Sfx } from "./sound";
import { serialize, deserialize } from "../core/persistence";

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
  private sfx: Sfx = new WebAudioSfx();
  private muteButton!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;

  /** Per-cell extra rows to offset UPWARD while the gravity drop plays.
   * Keyed "col,row" of the block's FINAL cell; 0 when settled. */
  private fallOffset = new Map<string, number>();
  private settleTween?: Phaser.Tweens.Tween;

  // Swap needs two taps; hold the first here.
  private swapFirst: Pos | null = null;

  constructor() {
    super("board");
  }

  private static readonly SAVE_KEY = "nm_save";

  create(): void {
    this.model = new Game();
    this.resumeIfSaved(); // auto-resume a saved board, if any
    this.computeLayout();

    this.cameras.main.setBackgroundColor(COLORS.bg);
    // Line first so it renders BEHIND the boxes: the connector runs
    // center-to-center and the boxes cover the overlapping part, leaving only
    // clean segments between boxes.
    this.lineGfx = this.add.graphics();
    this.cellLayer = this.add.container(0, 0);

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

    this.sfx.setMuted(this.loadMuted());
    this.muteButton = this.add
      .text(this.scale.width - 12, SCORE_H / 2, this.sfx.muted ? "🔇" : "🔊", {
        fontSize: "26px",
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(500);
    this.muteButton.on("pointerdown", (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      e: Phaser.Types.Input.EventData,
    ) => {
      e.stopPropagation?.();
      this.toggleMute();
    });

    this.restartButton = this.add
      .text(this.scale.width - 52, SCORE_H / 2, "🔄", { fontSize: "26px" })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(500);
    this.restartButton.on("pointerdown", (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      e: Phaser.Types.Input.EventData,
    ) => {
      e.stopPropagation?.();
      this.restart();
    });

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
    this.muteButton?.setPosition(this.scale.width - 12, SCORE_H / 2);
    this.restartButton?.setPosition(this.scale.width - 52, SCORE_H / 2);
    this.powerBar?.layout();
    this.gameOver?.layout();
    this.redraw();
  }

  // --- input --------------------------------------------------------------

  private pointerToPos(pointer: Phaser.Input.Pointer): Pos | null {
    return posFromPixel(pointer.x, pointer.y, this.origin, this.size);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.sfx.unlock(); // first user gesture satisfies browser autoplay rules
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
    if (this.model.path.length === 1) this.sfx.play("select");
    this.redraw();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging || this.model.targeting) return;
    const pos = this.pointerToPos(pointer);
    if (!pos) return;
    const before = this.model.path.length;
    this.model.pointer(pos);
    if (this.model.path.length !== before) {
      if (this.model.path.length > before) this.sfx.play("select");
      else this.sfx.play("deselect"); // path reverted (backtrack)
      this.redraw();
    }
  }

  private onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    const chainLength = this.model.path.length;
    const result = this.model.commit();
    if (result) {
      this.sfx.play("merge", chainLength);
      this.animateSettle();
      this.animateMerge(result.restingPos);
      this.save();
    } else {
      if (chainLength > 0) this.sfx.play("invalid");
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
        this.sfx.play("invalid");
        this.flashInvalid(pos);
        return; // not consumed; stay in targeting
      }
    } else if (power === "swap") {
      if (!this.swapFirst) {
        this.swapFirst = pos;
        this.sfx.play("select");
        this.redraw();
        return;
      }
      this.model.useSwap(this.swapFirst, pos);
      this.swapFirst = null;
    }
    this.sfx.play("powerup");
    this.powerBar.clearActive();
    this.scoreText.setText(this.model.score.toString());
    this.save();
    this.animateSettle();
    this.checkGameOver();
  }

  private restart(): void {
    this.model.startNew();
    this.gameOver.hide();
    this.swapFirst = null;
    this.scoreText.setText("0");
    this.save(); // persist the fresh board so a reload resumes the new game
    this.redraw();
  }

  private checkGameOver(): void {
    if (this.model.isOver) {
      this.sfx.play("gameover");
      this.gameOver.show(this.model.score);
      this.clearSave(); // a finished game shouldn't resume on reload
    }
  }

  private toggleMute(): void {
    this.sfx.unlock();
    const muted = !this.sfx.muted;
    this.sfx.setMuted(muted);
    this.muteButton.setText(muted ? "🔇" : "🔊");
    try {
      localStorage.setItem("nm_muted", muted ? "1" : "0");
    } catch {
      /* storage may be unavailable (private mode, blocked) — ignore */
    }
    if (!muted) this.sfx.play("select"); // audible confirmation on unmute
  }

  private loadMuted(): boolean {
    try {
      return localStorage.getItem("nm_muted") === "1";
    } catch {
      return false;
    }
  }

  // --- persistence --------------------------------------------------------

  /** Load a saved board and restore it, unless the save is absent/invalid. */
  private resumeIfSaved(): void {
    let json: string | null = null;
    try {
      json = localStorage.getItem(BoardScene.SAVE_KEY);
    } catch {
      return;
    }
    const state = deserialize(json);
    if (state) this.model.restore(state);
  }

  /** Persist the current board, score, and progress. Called after any change. */
  private save(): void {
    try {
      localStorage.setItem(
        BoardScene.SAVE_KEY,
        serialize({
          grid: this.model.grid,
          score: this.model.score,
          reachedTier: this.model.reachedTier,
        }),
      );
    } catch {
      /* storage unavailable or full — degrade silently to no-save */
    }
  }

  private clearSave(): void {
    try {
      localStorage.removeItem(BoardScene.SAVE_KEY);
    } catch {
      /* ignore */
    }
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
        // Apply any in-progress gravity drop: the block starts offset upward
        // by `fallRows` cells and eases down to its final center.
        const fallRows = this.fallOffset.get(`${col},${row}`) ?? 0;
        center.y -= fallRows * this.size;
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
    // Straight center-to-center polyline. It renders behind the boxes (see
    // create()), so the boxes mask the parts that cross them and only the
    // connectors between cells show.
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

  /** Animate the most recent gravity settle: every block that fell (or spawned)
   * slides down from its start offset to its final cell. */
  private animateSettle(): void {
    this.settleTween?.remove();
    this.fallOffset.clear();
    let maxFall = 0;
    // Build the final-cell -> rows-fallen map by block identity.
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const c = this.model.grid[row][col];
        if (!c) continue;
        const fell = this.model.lastSettle.get(c) ?? 0;
        if (fell > 0) {
          this.fallOffset.set(`${col},${row}`, fell);
          if (fell > maxFall) maxFall = fell;
        }
      }
    }
    if (maxFall === 0) {
      this.redraw();
      return;
    }
    // Slow, visible drop: scale duration with the longest fall.
    const progress = { t: 1 };
    const base = this.fallOffset;
    this.settleTween = this.tweens.add({
      targets: progress,
      t: 0,
      duration: 180 + maxFall * 110,
      ease: "Bounce.Out",
      onUpdate: () => {
        this.fallOffset = new Map(
          [...base].map(([k, rows]) => [k, rows * progress.t]),
        );
        this.redraw();
      },
      onComplete: () => {
        this.fallOffset.clear();
        this.redraw();
      },
    });
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
