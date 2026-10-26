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
  private boardMaskG!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private dragging = false;

  private powerBar!: PowerBar;
  private gameOver!: GameOverOverlay;
  private sfx: Sfx = new WebAudioSfx();
  private muteButton!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Container;
  private resumedOnLoad = false;

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
    const resumed = this.resumeIfSaved(); // auto-resume a saved board, if any
    this.resumedOnLoad = resumed;
    this.computeLayout();

    this.cameras.main.setBackgroundColor(COLORS.bg);
    // Line first so it renders BEHIND the boxes: the connector runs
    // center-to-center and the boxes cover the overlapping part, leaving only
    // clean segments between boxes.
    this.lineGfx = this.add.graphics();
    this.cellLayer = this.add.container(0, 0);
    // Clip the cell layer to the board area so falling / spawning blocks are
    // invisible until they enter the grid (no numbers floating above the top).
    this.boardMaskG = this.make.graphics({});
    this.cellLayer.setMask(this.boardMaskG.createGeometryMask());
    this.updateBoardMask();

    this.titleText = this.add
      .text(this.scale.width / 2, SCORE_H * 0.3, "NUMBER  MERGE", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#ffd166",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.scoreText = this.add
      .text(this.scale.width / 2, SCORE_H * 0.72, "0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "26px",
        color: COLORS.text,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.powerBar = new PowerBar(this, (p) => this.onPowerSelected(p));
    this.gameOver = new GameOverOverlay(this, () => this.restart());

    this.sfx.setMuted(this.loadMuted());
    // Both header buttons sit on the score's line: restart at the left edge,
    // mute at the right edge, balanced around the centered score.
    this.muteButton = this.add
      .text(this.scale.width - 12, SCORE_H * 0.72, this.sfx.muted ? "🔇" : "🔊", {
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

    // New-game button: a drawn circular-arrow (refresh) vector icon plus a
    // "New" label, so it renders at a consistent size across devices (an emoji
    // glyph does not). Origin is the container's own (0,0); laid out at x=12.
    this.restartButton = this.makeNewGameButton();
    this.restartButton
      .setInteractive(
        new Phaser.Geom.Rectangle(0, -SCORE_H * 0.32, 58, SCORE_H * 0.64),
        Phaser.Geom.Rectangle.Contains,
      )
      .setDepth(500);
    this.restartButton.on("pointerdown", (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      e: Phaser.Types.Input.EventData,
    ) => {
      e.stopPropagation?.();
      this.tweens.add({
        targets: this.restartButton,
        scale: 0.86,
        duration: 80,
        yoyo: true,
        ease: "Quad.Out",
      });
      this.restart();
    });
    this.restartButton.setPosition(12, SCORE_H * 0.72);

    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.scale.on("resize", this.onResize, this);

    // Fresh game (no save resumed): drop the board in under gravity.
    if (this.resumedOnLoad) this.redraw();
    else this.animateNewGame();
  }

  private computeLayout(): void {
    this.size = cellSize(this.scale.width, this.scale.height);
    this.origin = gridOrigin(this.scale.width, this.scale.height, this.size);
  }

  /** Size the clip mask to the exact board rectangle. */
  private updateBoardMask(): void {
    if (!this.boardMaskG) return;
    this.boardMaskG.clear();
    this.boardMaskG.fillStyle(0xffffff);
    this.boardMaskG.fillRect(
      this.origin.x,
      this.origin.y,
      COLS * this.size,
      ROWS * this.size,
    );
  }

  private onResize(): void {
    this.computeLayout();
    this.updateBoardMask();
    this.titleText?.setX(this.scale.width / 2);
    this.scoreText?.setX(this.scale.width / 2);
    this.muteButton?.setPosition(this.scale.width - 12, SCORE_H * 0.72);
    this.restartButton?.setPosition(12, SCORE_H * 0.72);
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
    // Capture the chain (positions + tiers) BEFORE commit mutates the board,
    // so we can fly the consumed blocks into the merge cell.
    const chain = this.model.path.map((p) => {
      const c = cellAt(this.model.grid, p);
      return { pos: p, tier: c ? c.tier : 1 };
    });
    const result = this.model.commit();
    if (result) {
      this.sfx.play("merge", chainLength);
      this.save();
      // Phase 1: consumed blocks fly into the landed cell. Phase 2 (settle +
      // result pop) runs after they arrive.
      this.animateMergeCollect(chain, result.landed, () => {
        this.animateSettle();
        this.animateMerge(result.restingPos);
        this.checkGameOver();
      });
      this.scoreText.setText(this.model.score.toString());
      return;
    }
    if (chainLength > 0) this.sfx.play("invalid");
    this.redraw();
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
      const hit = cellAt(this.model.grid, pos);
      this.model.useHammer(pos);
      this.sfx.play("powerup");
      this.powerBar.clearActive();
      // A hammer swings down and knocks the struck block, then the board falls.
      this.animateHammer(pos, hit ? hit.tier : null, () => {
        this.animateSettle();
        this.finishPowerUp();
      });
      return;
    }

    if (power === "magnet") {
      // Capture the gathered blocks BEFORE mutation so they can fly in.
      const target = cellAt(this.model.grid, pos);
      const gathered = target ? this.cellsOfTier(target.tier) : [];
      const ok = this.model.useMagnet(pos);
      if (!ok) {
        this.sfx.play("invalid");
        this.flashInvalid(pos);
        return; // not consumed; stay in targeting
      }
      this.sfx.play("powerup");
      this.powerBar.clearActive();
      // Pull every gathered block into the tapped cell, then settle + pop.
      this.animateMergeCollect(gathered, pos, () => {
        this.animateSettle();
        this.animateMerge(pos);
        this.finishPowerUp();
      });
      return;
    }

    // swap
    if (!this.swapFirst) {
      this.swapFirst = pos;
      this.sfx.play("select");
      this.redraw();
      return;
    }
    const a = this.swapFirst;
    const b = pos;
    const ca = cellAt(this.model.grid, a);
    const cb = cellAt(this.model.grid, b);
    this.swapFirst = null;
    this.model.useSwap(a, b);
    this.sfx.play("powerup");
    this.powerBar.clearActive();
    // Slide the two blocks past each other to their new cells.
    this.animateSwap(a, b, ca ? ca.tier : null, cb ? cb.tier : null, () => {
      this.finishPowerUp();
    });
  }

  /** Shared post-power-up bookkeeping. */
  private finishPowerUp(): void {
    this.scoreText.setText(this.model.score.toString());
    this.save();
    this.checkGameOver();
  }

  /** Positions of every block currently sharing `tier`. */
  private cellsOfTier(tier: number): { pos: Pos; tier: number }[] {
    const out: { pos: Pos; tier: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const c = this.model.grid[row][col];
        if (c && c.tier === tier) out.push({ pos: { col, row }, tier });
      }
    }
    return out;
  }

  /** Build the new-game button: a drawn circular refresh arrow + "New" label,
   * laid out horizontally with the container's left edge at x=0. */
  private makeNewGameButton(): Phaser.GameObjects.Container {
    const icon = this.add.graphics();
    const r = 9;
    // Circular arrow: an open-ended ring (gap at the top) with an arrowhead
    // at the gap, reading as the familiar "refresh / new" glyph.
    icon.lineStyle(3, 0xffd166, 1);
    icon.beginPath();
    icon.arc(0, 0, r, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(210), false);
    icon.strokePath();
    // Arrowhead at the open end (top-right), pointing clockwise.
    const ax = Math.cos(Phaser.Math.DegToRad(-60)) * r;
    const ay = Math.sin(Phaser.Math.DegToRad(-60)) * r;
    icon.fillStyle(0xffd166, 1);
    icon.fillTriangle(ax + 4, ay - 1, ax - 3, ay - 4, ax - 1, ay + 4);
    icon.setPosition(r + 2, 0);

    const label = this.add
      .text(r * 2 + 8, 0, "New", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: COLORS.text,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    return this.add.container(0, 0, [icon, label]);
  }

  private restart(): void {
    this.model.startNew();
    this.gameOver.hide();
    this.swapFirst = null;
    this.scoreText.setText("0");
    this.save(); // persist the fresh board so a reload resumes the new game
    this.animateNewGame(); // drop every block in under gravity
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

  /** Load a saved board and restore it. Returns true if a save was resumed. */
  private resumeIfSaved(): boolean {
    let json: string | null = null;
    try {
      json = localStorage.getItem(BoardScene.SAVE_KEY);
    } catch {
      return false;
    }
    const state = deserialize(json);
    if (!state) return false;
    this.model.restore(state);
    return true;
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

  /** Phase 1 of a merge: draw the consumed blocks and fly them into the
   * landed cell, then call `onDone`. The under-board is left as last drawn
   * (the pre-merge state) so the fly-in reads clearly. */
  private animateMergeCollect(
    chain: { pos: Pos; tier: number }[],
    landed: Pos,
    onDone: () => void,
  ): void {
    this.lineGfx.clear(); // drop the drag connector before the fly-in
    const dest = cellCenter(landed, this.origin, this.size);
    const inset = this.size * 0.06;
    const s = this.size - inset * 2;
    const layer = this.add.container(0, 0).setDepth(900);

    const movers: Phaser.GameObjects.Container[] = [];
    let lastColor = COLORS.line;
    for (const { pos, tier } of chain) {
      const from = cellCenter(pos, this.origin, this.size);
      lastColor = tierColor(tier);
      const g = this.add.graphics();
      g.fillStyle(lastColor, 1);
      g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
      const t = this.add
        .text(0, 0, tierLabel(tier), {
          fontFamily: "system-ui, sans-serif",
          fontSize: `${Math.floor(this.size * 0.34)}px`,
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const c = this.add.container(from.x, from.y, [g, t]);
      layer.add(c);
      movers.push(c);
    }

    let remaining = movers.length;
    if (remaining === 0) {
      layer.destroy();
      onDone();
      return;
    }
    movers.forEach((m, i) => {
      // Spin direction alternates per block so the chain swirls into the point.
      const spin = (i % 2 === 0 ? 1 : -1) * Phaser.Math.DegToRad(180);
      this.tweens.add({
        targets: m,
        x: dest.x,
        y: dest.y,
        scale: 0.3,
        rotation: spin, // rotate as it travels (like the original's merge spin)
        ease: "Cubic.In",
        duration: 150,
        delay: i * 25, // slight stagger so the chain "zips" together
        onComplete: () => {
          if (--remaining === 0) {
            layer.destroy();
            this.spawnMergeBurst(dest.x, dest.y, lastColor);
            onDone();
          }
        },
      });
    });
  }

  /** A short particle burst at the merge point: small dots fly out and fade. */
  private spawnMergeBurst(x: number, y: number, color: number): void {
    const n = 10;
    const reach = this.size * 0.9;
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      const dot = this.add.graphics().setDepth(950);
      dot.fillStyle(color, 1);
      dot.fillCircle(0, 0, Math.max(2, this.size * 0.05));
      dot.setPosition(x, y);
      const dist = reach * (0.6 + Math.random() * 0.4);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        ease: "Cubic.Out",
        duration: 300 + Math.random() * 150,
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Draw a simple cartoon hammer (head + handle) centered at (0,0), pointing
   * down-left so it reads as cocked back before a strike. */
  private makeHammer(size: number): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    const headW = size * 0.7;
    const headH = size * 0.42;
    const handleW = size * 0.16;
    const handleL = size * 0.75;
    // Handle (brown), extending down from the head.
    g.fillStyle(0x8a5a2b, 1);
    g.fillRoundedRect(-handleW / 2, 0, handleW, handleL, handleW * 0.4);
    // Head (grey metal) sitting on top of the handle.
    g.fillStyle(0x9aa3b2, 1);
    g.fillRoundedRect(-headW / 2, -headH, headW, headH, headH * 0.22);
    g.fillStyle(0xc7cdd8, 1);
    g.fillRoundedRect(-headW / 2, -headH, headW * 0.28, headH, headH * 0.22);
    return this.add.container(0, 0, [g]);
  }

  /** Hammer: a hammer swings down and knocks the struck block (which recoils
   * and shatters into debris), then the board settles via onDone. */
  private animateHammer(
    target: Pos,
    tier: number | null,
    onDone: () => void,
  ): void {
    // Redraw the real board to its current (post-hammer, settled) state up
    // front with the gravity drop offsets already applied, so the under-board
    // is correct for the whole strike and there is no stale->fresh jump (which
    // showed up as a full-board flicker when the temp layer was torn down).
    this.beginSettleFrozen();
    const c = cellCenter(target, this.origin, this.size);
    const s = this.size - this.size * 0.06 * 2;
    const layer = this.add.container(0, 0).setDepth(940);

    // Temporary copy of the struck block (the real one is already removed).
    let block: Phaser.GameObjects.Container | null = null;
    if (tier !== null) {
      const bg = this.add.graphics();
      bg.fillStyle(tierColor(tier), 1);
      bg.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
      const t = this.add
        .text(0, 0, tierLabel(tier), {
          fontFamily: "system-ui, sans-serif",
          fontSize: `${Math.floor(this.size * 0.34)}px`,
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      block = this.add.container(c.x, c.y, [bg, t]);
      layer.add(block);
    }

    // Hammer cocked back above-right of the cell, rotated up.
    const hammer = this.makeHammer(this.size);
    hammer.setPosition(c.x + this.size * 0.55, c.y - this.size * 0.75);
    hammer.setRotation(Phaser.Math.DegToRad(-70));
    layer.add(hammer);

    const impactColor = tier !== null ? tierColor(tier) : COLORS.line;
    this.tweens.add({
      targets: hammer,
      rotation: Phaser.Math.DegToRad(-8),
      x: c.x + this.size * 0.18,
      y: c.y - this.size * 0.34,
      duration: 360,
      delay: 120, // brief hold of the cocked-back hammer before it swings
      ease: "Quad.In",
      onComplete: () => {
        // Impact: block squashes and jitters, debris flies, hammer bounces up.
        if (block) {
          this.tweens.add({
            targets: block,
            scaleX: 1.25,
            scaleY: 0.6,
            duration: 140,
            yoyo: true,
            ease: "Quad.Out",
            onComplete: () => block?.destroy(),
          });
        }
        this.spawnMergeBurst(c.x, c.y, impactColor);
        this.tweens.add({
          targets: hammer,
          rotation: Phaser.Math.DegToRad(-45),
          y: c.y - this.size * 0.7,
          alpha: 0,
          duration: 320,
          ease: "Quad.Out",
          onComplete: () => {
            layer.destroy();
            onDone();
          },
        });
      },
    });
  }

  /** Swap: slide two temporary blocks past each other to the other's cell,
   * then redraw to the swapped board. */
  private animateSwap(
    a: Pos,
    b: Pos,
    tierA: number | null,
    tierB: number | null,
    onDone: () => void,
  ): void {
    this.redraw(); // show the already-swapped board, then cover both cells
    const s = this.size - this.size * 0.06 * 2;
    const ca = cellCenter(a, this.origin, this.size);
    const cb = cellCenter(b, this.origin, this.size);
    const layer = this.add.container(0, 0).setDepth(900);

    const makeMover = (from: Point, tier: number | null) => {
      if (tier === null) return null; // empty cell: nothing to slide
      const g = this.add.graphics();
      g.fillStyle(tierColor(tier), 1);
      g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
      const t = this.add
        .text(0, 0, tierLabel(tier), {
          fontFamily: "system-ui, sans-serif",
          fontSize: `${Math.floor(this.size * 0.34)}px`,
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const cont = this.add.container(from.x, from.y, [g, t]);
      layer.add(cont);
      return cont;
    };

    // Cover the destination cells so the final state isn't visible mid-slide.
    const cover = this.add.graphics().setDepth(880);
    cover.fillStyle(COLORS.cellEmpty, 1);
    for (const p of [a, b]) {
      const cc = cellCenter(p, this.origin, this.size);
      cover.fillRoundedRect(cc.x - s / 2, cc.y - s / 2, s, s, s * 0.18);
    }

    const mA = makeMover(ca, tierA); // block that started at a -> moves to b
    const mB = makeMover(cb, tierB); // block that started at b -> moves to a
    const targets = [mA, mB].filter((m): m is Phaser.GameObjects.Container => !!m);
    if (targets.length === 0) {
      cover.destroy();
      layer.destroy();
      this.redraw();
      onDone();
      return;
    }
    let remaining = targets.length;
    const done = () => {
      if (--remaining === 0) {
        cover.destroy();
        layer.destroy();
        this.redraw();
        onDone();
      }
    };
    if (mA) this.tweens.add({ targets: mA, x: cb.x, y: cb.y, duration: 200, ease: "Quad.InOut", onComplete: done });
    if (mB) this.tweens.add({ targets: mB, x: ca.x, y: ca.y, duration: 200, ease: "Quad.InOut", onComplete: done });
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

  /** Draw the board with the pending fall offsets fully applied (blocks shown
   * at their pre-fall positions), without starting the drop tween. Lets an
   * effect animation play over a correct, static board before the fall, so the
   * teardown doesn't flash a stale board. */
  private beginSettleFrozen(): void {
    this.fallOffset.clear();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const c = this.model.grid[row][col];
        if (!c) continue;
        const fell = this.model.lastSettle.get(c) ?? 0;
        if (fell > 0) this.fallOffset.set(`${col},${row}`, fell);
      }
    }
    this.redraw();
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

  /** New game: every block drops in from above under gravity, columns filling
   * bottom-up with a slight per-column stagger. */
  private animateNewGame(): void {
    this.settleTween?.remove();
    const base = new Map<string, number>();
    let maxFall = 0;
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        if (!this.model.grid[row][col]) continue;
        // Deeper cells start higher (fill bottom-up); stagger columns slightly.
        const fall = ROWS + 1 - row + col * 0.6;
        base.set(`${col},${row}`, fall);
        if (fall > maxFall) maxFall = fall;
      }
    }
    if (maxFall === 0) {
      this.redraw();
      return;
    }
    this.fallOffset = new Map(base);
    this.redraw();
    const progress = { t: 1 };
    this.settleTween = this.tweens.add({
      targets: progress,
      t: 0,
      duration: 220 + maxFall * 90,
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
