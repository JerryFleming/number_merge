import Phaser from "phaser";
import { Game, type PowerUp } from "../core/game";
import { resolveMerge } from "../core/merge";
import { cellAt } from "../core/board";
import { magnetUsable } from "../core/powerups";
import { COLS, ROWS, type Cell, type Grid, type Pos } from "../core/types";
import {
  cellCenter,
  cellSize,
  gridOrigin,
  posFromPixel,
  posFromPixelInner,
  SCORE_H,
  type Point,
} from "./layout";
import { COLORS, tierColor, tierLabel, tierTextColor } from "./theme";
import { PowerBar } from "./PowerBar";
import { GameOverOverlay } from "./GameOver";
import { Tutorial } from "./Tutorial";
import { PhaserSfx, AUDIO_ASSETS, type Sfx } from "./sound";
import { serialize, deserialize } from "../core/persistence";
import { IMAGE_ASSETS, TEX } from "./assets";
import type { TutorialStep } from "../core/tutorial";

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
  private versionText!: Phaser.GameObjects.Text;
  private gameIcon!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private dragging = false;

  private powerBar!: PowerBar;
  private gameOver!: GameOverOverlay;
  private tutorial!: Tutorial;
  private sfx!: Sfx;
  private muteButton!: Phaser.GameObjects.Text;
  /** Content width of the New button (icon through label), for layout. */
  private newButtonW = 56;
  private helpButton!: Phaser.GameObjects.Container;
  private restartButton!: Phaser.GameObjects.Container;
  private resumedOnLoad = false;

  /** Per-cell extra rows to offset UPWARD while the gravity drop plays.
   * Keyed "col,row" of the block's FINAL cell; 0 when settled. */
  private fallOffset = new Map<string, number>();
  private settleTween?: Phaser.Tweens.Tween;

  /** Idle "hint" that highlights a possible move when the player sits still.
   * `hintTimer` fires after HINT_IDLE_MS of no interaction; `hintGfx`/`hintTween`
   * render the pulsing rings until the next interaction. */
  private static readonly HINT_IDLE_MS = 6000;
  private hintTimer?: Phaser.Time.TimerEvent;
  private hintGfx?: Phaser.GameObjects.Graphics;
  private hintTween?: Phaser.Tweens.Tween;

  /** Lowest tier that earns a crown. In the original the crown first appears on
   * the block that reaches 1024 (2^10 = tier 10), then moves up to each new
   * biggest — it is never shown on smaller numbers. */
  private static readonly CROWN_MIN_TIER = 10;

  /** The highest tier that currently wears the crown. When a merge pushes the
   * reached tier above this, the merge that did it hands the crown to its
   * result block. */
  private crownedTier = 0;
  /** The single block object that currently wears the crown (the one that set
   * the highest tier reached). Tracked by identity so the crown follows it
   * through gravity, and only ever one block is crowned — like the original,
   * which crowns only the block whose merge set a new record. */
  private crownedBlock: Cell | null = null;
  /** Set for one redraw when a new record is set, so the crown on the fresh
   * record block plays its scale-up overshoot instead of appearing instantly. */
  private crownPop = false;
  /** True until the player first *earns* a crown in this session (a merge that
   * newly sets a crowned record). The first such crown plays a one-time
   * fanfare. Resuming a saved game that already has a crown does NOT consume
   * this — the celebration only fires on a live record-setting merge. */
  private firstCrownPending = true;

  // Swap needs two taps; hold the first here.
  private swapFirst: Pos | null = null;

  /** When the tutorial is replayed from the help button mid-game, the player's
   * game is snapshotted here and restored when the tutorial ends (a first-run
   * tutorial leaves this null and starts a fresh board instead). */
  private preTutorialSnapshot: {
    grid: Grid;
    score: bigint;
    reachedTier: number;
    useCounts: Record<PowerUp, number>;
  } | null = null;

  constructor() {
    super("board");
  }

  private static readonly SAVE_KEY = "nm_save";
  private static readonly TUTORIAL_KEY = "nm_tutorial_done";

  preload(): void {
    for (const [key, url] of IMAGE_ASSETS) this.load.image(key, url);
    for (const [key, url] of AUDIO_ASSETS) this.load.audio(key, url);
  }

  create(): void {
    this.sfx = new PhaserSfx(this);
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

    // Title row: the original game's icon next to the game name, centered.
    this.gameIcon = this.add
      .image(0, SCORE_H * 0.3, TEX.gameIcon)
      .setOrigin(0.5)
      .setDisplaySize(SCORE_H * 0.42, SCORE_H * 0.42);
    this.titleText = this.add
      .text(0, SCORE_H * 0.3, "NUMBER  MERGE", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#ffd166",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.versionText = this.add
      .text(0, SCORE_H * 0.3, __GIT_HASH__, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: "#8a8fa3",
      })
      .setOrigin(0, 0.5);
    this.layoutTitleRow();

    this.scoreText = this.add
      .text(this.scale.width / 2, SCORE_H * 0.80, "0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "26px",
        color: COLORS.text,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.powerBar = new PowerBar(this, (p) => this.onPowerSelected(p));
    this.gameOver = new GameOverOverlay(this, () => this.restart());
    this.tutorial = new Tutorial(
      this,
      () => this.onTutorialFinished(),
      (step) => this.onTutorialStep(step),
    );

    this.sfx.setMuted(this.loadMuted());
    // The New, tutorial, and sound controls flank the bottom power-up row:
    // New to the left of the power-ups, tutorial + sound to their right.
    // Positions are set in layoutControls() once the power bar is laid out.
    this.muteButton = this.add
      .text(0, 0, this.sfx.muted ? "🔇" : "🔊", {
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

    // Help button: a drawn graduation-cap ("how to play") icon that replays the
    // tutorial. Drawn vector so it reads clearly and renders the same on every
    // device (an emoji did not). Sits to the right of the power-ups, left of mute.
    this.helpButton = this.makeTutorialButton();
    this.helpButton.setDepth(500);
    this.helpButton.on("pointerdown", (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      e: Phaser.Types.Input.EventData,
    ) => {
      e.stopPropagation?.();
      this.tweens.add({
        targets: this.helpButton,
        scale: 0.84,
        duration: 80,
        yoyo: true,
        ease: "Quad.Out",
      });
      this.replayTutorial();
    });

    // New-game button: a drawn circular-arrow (refresh) vector icon plus a
    // "New" label, so it renders at a consistent size across devices (an emoji
    // glyph does not). Sits just left of the power-ups; laid out below.
    this.restartButton = this.makeNewGameButton();
    this.restartButton.setDepth(500); // hit area is set inside makeNewGameButton
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

    this.layoutControls();

    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.scale.on("resize", this.onResize, this);

    this.powerBar.setCounts(this.model.useCounts); // show resumed counts, if any

    // A resumed game already holds its record tier: crown one block at that
    // tier quietly (no pop). A fresh game has reachedTier 1 → no crown.
    this.crownedTier = this.model.reachedTier;
    this.syncCrownedBlock();

    if (this.resumedOnLoad) {
      // A resumed game: a returning player, so never the tutorial.
      this.redraw();
      this.resetHintTimer();
    } else if (this.shouldRunTutorial()) {
      // Brand-new player (no save, tutorial not yet seen): run the intro.
      this.tutorial.setGeometry(this.origin, this.size);
      this.tutorial.start();
    } else {
      // Fresh game for a returning player: drop the board in under gravity.
      this.animateNewGame();
      this.resetHintTimer();
    }
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

  /** Center the game-icon + title name as one row on the title line; the
   * build hash trails the name but is left out of the centering. */
  private layoutTitleRow(): void {
    if (!this.gameIcon || !this.titleText) return;
    const gap = 8;
    const iconW = this.gameIcon.displayWidth;
    const rowW = iconW + gap + this.titleText.width;
    const left = (this.scale.width - rowW) / 2;
    this.gameIcon.setX(left + iconW / 2);
    this.titleText.setX(left + iconW + gap);
    this.versionText?.setX(left + rowW + 6);
  }

  private onResize(): void {
    this.computeLayout();
    this.updateBoardMask();
    this.layoutTitleRow();
    this.scoreText?.setX(this.scale.width / 2);
    this.powerBar?.layout();
    this.layoutControls();
    this.gameOver?.layout();
    this.tutorial?.setGeometry(this.origin, this.size);
    this.redraw();
    // Hint rings were drawn at the old geometry; re-arm from the new one.
    if (this.hintTimer) this.resetHintTimer();
  }

  // --- input --------------------------------------------------------------

  private pointerToPos(pointer: Phaser.Input.Pointer): Pos | null {
    return posFromPixel(pointer.x, pointer.y, this.origin, this.size);
  }

  /** The cell under the pointer, but only when the pointer is well inside it
   * (central region). Used while dragging so diagonal moves don't snap onto an
   * orthogonal neighbour whose edge the finger merely grazes. */
  private pointerToPosInner(pointer: Phaser.Input.Pointer): Pos | null {
    return posFromPixelInner(pointer.x, pointer.y, this.origin, this.size);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.sfx.unlock(); // first user gesture satisfies browser autoplay rules
    this.resetHintTimer(); // any interaction clears a hint and restarts idle
    // Tutorial Skip sits above the board (where pointerToPos is null), so test
    // it here in the always-firing global handler before any early return.
    if (this.tutorial.isActive && this.tutorial.tryTapSkip(pointer.x, pointer.y)) {
      return;
    }
    if (this.model.isOver) return;
    const pos = this.pointerToPos(pointer);
    if (!pos) return;

    // During a drag-step tutorial, only the demo cells are interactive. A tap
    // elsewhere just nudges the demo (no drag starts).
    if (this.tutorial.isActive && !this.tutorialAllows(pos)) {
      if (this.tutorialIsDragStep()) this.tutorial.flashWrong();
      return;
    }

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
    // Inner hit-test: ignore cells the finger only grazes at the edge, so a
    // diagonal drag isn't stolen by an orthogonal neighbour en route.
    const pos = this.pointerToPosInner(pointer);
    if (!pos) return;
    // Keep the drag confined to the demo cells during a drag-step tutorial.
    if (this.tutorial.isActive && !this.tutorialAllows(pos)) return;
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
    const inTutorial = this.tutorial.isActive;

    // Tutorial demo merge: resolve WITHOUT mutating the model (no collapse /
    // random refill, which would wreck the scripted demo). A valid chain plays
    // the collect-and-pop, then advances; an invalid one flashes the cells.
    if (inTutorial) {
      const resolved = resolveMerge(this.model.grid, this.model.path);
      this.model.clearPath();
      this.redraw(); // drop the drag selection before the fly-in
      if (resolved) {
        this.sfx.play("merge");
        const landed = resolved.landed;
        this.animateMergeCollect(chain, landed, () => {
          this.flashMergeResult(landed, resolved.tier);
          this.time.delayedCall(450, () => this.tutorial.advance());
        });
      } else if (chainLength > 0 && this.tutorialIsDragStep()) {
        this.sfx.play("invalid");
        this.tutorial.flashWrong();
      }
      return;
    }

    const result = this.model.commit();
    if (result) {
      this.sfx.play("merge");
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
    // On the tutorial's power-up step, tapping any power-up completes it (and
    // we don't actually arm targeting over the scripted demo board).
    if (this.tutorial.isActive) {
      if (this.tutorial.currentStep?.completeOn === "powerup") {
        this.sfx.play("select");
        this.powerBar.clearActive();
        this.tutorial.advance();
      }
      return;
    }
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
      this.sfx.play("hammer");
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
      this.sfx.play("magnet");
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
    this.sfx.play("swap");
    this.powerBar.clearActive();
    // Slide the two blocks past each other to their new cells.
    this.animateSwap(a, b, ca ? ca.tier : null, cb ? cb.tier : null, () => {
      this.finishPowerUp();
    });
  }

  /** Shared post-power-up bookkeeping. */
  private finishPowerUp(): void {
    this.scoreText.setText(this.model.score.toString());
    this.powerBar.setCounts(this.model.useCounts);
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

  /** Build the new-game button: a drawn circular refresh arrow + label,
   * laid out horizontally with the container's left edge at x=0. The hit area
   * is sized to the actual content so the whole label (not just part of it) is
   * tappable. */
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

    const labelX = r * 2 + 8;
    const label = this.add
      .text(labelX, 0, "New", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: COLORS.text,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    const container = this.add.container(0, 0, [icon, label]);
    // Hit area spans the icon through the end of the label, full header height.
    const width = labelX + label.width;
    this.newButtonW = width;
    container.setInteractive(
      new Phaser.Geom.Rectangle(-4, -SCORE_H * 0.33, width + 8, SCORE_H * 0.66),
      Phaser.Geom.Rectangle.Contains,
    );
    return container;
  }

  /** Build the tutorial button: a drawn graduation-cap ("how to play") icon,
   * centered on the container's (0,0) so it can be right-anchored like the mute
   * button. A generous centered hit area makes it easy to tap. */
  private makeTutorialButton(): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    const gold = 0xffd166;
    const w = 22; // mortarboard half-width
    const topH = 7; // mortarboard half-height (the flat diamond board)
    const boardY = -3; // the board sits a little above center

    // Mortarboard: a flat diamond (the square cap seen in perspective).
    g.fillStyle(gold, 1);
    g.beginPath();
    g.moveTo(0, boardY - topH);
    g.lineTo(w, boardY);
    g.lineTo(0, boardY + topH);
    g.lineTo(-w, boardY);
    g.closePath();
    g.fillPath();

    // Cap base: a small trapezoid hanging under the board's center (the head
    // band of the cap), drawn in the dark bg color so it reads as a cutout.
    g.fillStyle(COLORS.bg, 1);
    g.beginPath();
    g.moveTo(-w * 0.42, boardY + topH * 0.2);
    g.lineTo(w * 0.42, boardY + topH * 0.2);
    g.lineTo(w * 0.3, boardY + topH + 7);
    g.lineTo(-w * 0.3, boardY + topH + 7);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, gold, 1);
    g.strokePath();

    // Tassel: a short cord from the board's right tip down to a little knob.
    const tx = w * 0.62;
    g.lineStyle(2, gold, 1);
    g.beginPath();
    g.moveTo(0, boardY); // button center on the board
    g.lineTo(tx, boardY + 1);
    g.lineTo(tx, boardY + 9);
    g.strokePath();
    g.fillStyle(gold, 1);
    g.fillCircle(tx, boardY + 11, 2.2);

    // The gold mortarboard carries the visual weight; nudge the whole glyph up
    // so its perceived center sits on the row (level with the mute icon) rather
    // than reading low because of the lighter cap/tassel below.
    g.setY(-3);

    const container = this.add.container(0, 0, [g]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-w - 4, -SCORE_H * 0.33, w * 2 + 8, SCORE_H * 0.66),
      Phaser.Geom.Rectangle.Contains,
    );
    return container;
  }

  private restart(): void {
    this.model.startNew();
    this.crownedTier = this.model.reachedTier; // reset: no crown until re-earned
    this.syncCrownedBlock();
    this.gameOver.hide();
    this.swapFirst = null;
    this.scoreText.setText("0");
    this.powerBar.setCounts(this.model.useCounts); // reset badges to 0
    this.save(); // persist the fresh board so a reload resumes the new game
    this.animateNewGame(); // drop every block in under gravity
    this.resetHintTimer();
  }

  private checkGameOver(): void {
    if (this.model.isOver) {
      this.clearHint();
      this.hintTimer?.remove();
      this.sfx.play("gameover");
      this.gameOver.show(this.model.score);
      this.clearSave(); // a finished game shouldn't resume on reload
      return;
    }
    // Board changed and play continues: restart the idle countdown.
    this.resetHintTimer();
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

  // --- tutorial -----------------------------------------------------------

  /** Position the New button to the left of the power-up row and the tutorial +
   * sound buttons to its right, all vertically centered on that row. Call after
   * the power bar has been laid out (its bounds drive the placement). */
  private layoutControls(): void {
    if (!this.powerBar) return;
    const cy = this.powerBar.rowY;
    // Controls hug the power-up group (not the screen edges), separated from
    // it by a clear fixed gap on each side.
    const gap = 24;

    // New button: left-anchored content spanning [0, width]; end it `gap`
    // short of the power-up group's left edge.
    this.restartButton?.setPosition(this.powerBar.leftX - gap - this.newButtonW, cy);

    // Tutorial cap (centered on itself, half-width 22) just right of the
    // power-ups, then mute (right/middle origin) after it.
    const helpX = this.powerBar.rightX + gap + 22;
    this.helpButton?.setPosition(helpX, cy);
    const muteW = this.muteButton?.width ?? 26;
    this.muteButton?.setPosition(helpX + 22 + 16 + muteW, cy);
  }


  /** Replay the how-to-play tutorial on demand (the header's help button).
   * Resets any in-progress targeting/drag and runs from step 1; the normal
   * game resumes when it finishes or is skipped. */
  private replayTutorial(): void {
    if (this.tutorial.isActive) return; // already running
    this.model.cancelTargeting();
    this.powerBar.clearActive();
    this.swapFirst = null;
    this.dragging = false;
    this.gameOver.hide();
    this.clearHint();
    this.hintTimer?.remove();
    // Snapshot the player's game so finishing the replay restores it (the
    // tutorial overwrites the board with its scripted steps).
    this.preTutorialSnapshot = {
      grid: this.model.grid.map((r) => r.slice()),
      score: this.model.score,
      reachedTier: this.model.reachedTier,
      useCounts: { ...this.model.useCounts },
    };
    this.tutorial.setGeometry(this.origin, this.size);
    this.tutorial.start();
  }

  /** Is `pos` one of the cells the current tutorial step lets the player use? */
  private tutorialAllows(pos: Pos): boolean {
    return this.tutorial.allowedCells.some(
      (c) => c.col === pos.col && c.row === pos.row,
    );
  }

  /** True while the active tutorial step is demonstrated by a board drag (as
   * opposed to the power-up step, which has no demo cells). */
  private tutorialIsDragStep(): boolean {
    return (this.tutorial.currentStep?.demo.length ?? 0) >= 2;
  }

  /** A brand-new player: no persisted tutorial-done flag. (resumeIfSaved has
   * already ruled out a saved board before this is consulted.) */
  private shouldRunTutorial(): boolean {
    try {
      return localStorage.getItem(BoardScene.TUTORIAL_KEY) !== "1";
    } catch {
      // No storage (private mode): show it once this session rather than never.
      return true;
    }
  }

  private markTutorialDone(): void {
    try {
      localStorage.setItem(BoardScene.TUTORIAL_KEY, "1");
    } catch {
      /* storage unavailable — the tutorial may reappear next load; acceptable */
    }
  }

  /** Load the scripted board for a tutorial step and show it (no drop anim, so
   * the demo cells sit still under the hand). */
  private onTutorialStep(step: TutorialStep): void {
    // Stop any in-flight board animation from the previous step's demo merge,
    // and clear its fall offsets, so the new scripted board renders cleanly at
    // its real positions (a leftover settle tween would keep redrawing stale,
    // offset blocks and leave the demo cells unreachable).
    this.settleTween?.remove();
    this.settleTween = undefined;
    this.fallOffset.clear();
    this.model.loadGrid(step.grid);
    this.crownedTier = this.model.reachedTier;
    this.crownedBlock = null; // no crown on the scripted demo board
    this.redraw();
  }

  /** Tutorial finished (or skipped): persist the flag, then either restore the
   * player's game (manual replay) or start a fresh board (first run). */
  private onTutorialFinished(): void {
    this.markTutorialDone();
    const snap = this.preTutorialSnapshot;
    this.preTutorialSnapshot = null;
    if (snap) {
      // Manual replay from the help button: put the player's game back.
      this.model.restore(snap);
      this.crownedTier = this.model.reachedTier;
      this.syncCrownedBlock();
      this.scoreText.setText(this.model.score.toString());
      this.powerBar.setCounts(this.model.useCounts);
      this.save();
      this.redraw();
      this.checkGameOver();
      return;
    }
    // First run: start a real game and drop it in under gravity.
    this.model.startNew();
    this.crownedTier = this.model.reachedTier;
    this.crownedBlock = null;
    this.scoreText.setText("0");
    this.powerBar.setCounts(this.model.useCounts);
    this.save();
    this.animateNewGame();
    this.resetHintTimer();
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
          useCounts: this.model.useCounts,
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
              color: tierTextColor(c.tier),
              fontStyle: "bold",
            })
            .setOrigin(0.5);
          this.cellLayer.add(label);

          // Crown exactly the one block that set the highest tier reached (the
          // original's "block-add-crown-icon"). Tracked by object identity, so
          // it rides the same fall offset and follows that block through
          // gravity. Suppressed during the tutorial.
          if (!this.tutorial?.isActive && c === this.crownedBlock) {
            this.addCrown(center.x, center.y - s / 2, s);
          }
        }
      }
    }
    this.drawPathLine();
  }

  /** Re-establish which block wears the crown after a board is loaded without a
   * record-setting merge (resume / restore). We don't persist the exact record
   * block, so crown one block currently at the reached tier, if the tier is
   * above the base; otherwise clear it. `startNew` passes reachedTier 1, which
   * clears it. */
  private syncCrownedBlock(): void {
    this.crownedBlock = null;
    const tier = this.model.reachedTier;
    if (tier < BoardScene.CROWN_MIN_TIER) return; // below 1024: no crown
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const c = this.model.grid[row][col];
        if (c && c.tier === tier) {
          this.crownedBlock = c;
          return;
        }
      }
    }
  }

  /** Draw the crown sprite straddling the top edge of a block centered at
   * (cx, topY). When a new record was just set, it pops in with a scale-up
   * overshoot (the original's best-score crown scale-up ease). */
  private addCrown(cx: number, topY: number, blockSize: number): void {
    const tex = this.textures.exists(TEX.crown);
    const w = blockSize * 0.5;
    const h = (w * 59) / 111; // preserve the sprite's aspect ratio
    const y = topY + h * 0.15; // sit astride the top edge, like the original
    let crown: Phaser.GameObjects.GameObject;
    if (tex) {
      crown = this.add
        .image(cx, y, TEX.crown)
        .setOrigin(0.5)
        .setDisplaySize(w, h);
    } else {
      // Fallback if the sprite failed to load: a small gold diamond marker.
      const g = this.add.graphics();
      g.fillStyle(0xffd166, 1);
      g.fillTriangle(cx - w / 2, y, cx + w / 2, y, cx, y - h);
      crown = g;
    }
    this.cellLayer.add(crown);
    if (this.crownPop) {
      // New record: scale the crown up from nothing with an overshoot bounce.
      (crown as Phaser.GameObjects.Image).setScale?.(0.1);
      this.tweens.add({
        targets: crown,
        scale: 1,
        ease: "Back.Out",
        duration: 300,
      });
    }
  }

  private drawPathLine(): void {
    this.lineGfx.clear();
    const path = this.model.path;
    if (path.length < 2) return;
    // Tint the connector with the color of the first-selected box (chain head).
    const head = cellAt(this.model.grid, path[0]);
    const lineColor = head ? tierColor(head.tier) : COLORS.line;
    this.lineGfx.lineStyle(Math.max(6, this.size * 0.12), lineColor, 0.9);
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
    // A merge that lifts the highest tier reached is a "new level" — the crown
    // moves to THIS block (by identity) and pops in. Only a record-setting merge
    // is crowned, so ordinary merges never get one. Arm the pop for this redraw.
    // Only a new record at or above the crown threshold (1024) earns the crown.
    const newRecord =
      this.model.reachedTier > this.crownedTier &&
      this.model.reachedTier >= BoardScene.CROWN_MIN_TIER;
    // The first crown earned this session: a record-setting merge at or above
    // the crown threshold, with no crown earned yet. Usually this is the 1024
    // merge, but a resumed game can first cross a record at a higher tier, so
    // key off the session flag — not a fixed tier — and show the real value.
    const firstCrown = newRecord && this.firstCrownPending;
    if (newRecord) {
      this.crownedBlock = cellAt(this.model.grid, landed);
      this.firstCrownPending = false;
    }
    this.crownPop = newRecord;
    this.redraw();
    this.crownPop = false;
    this.crownedTier = this.model.reachedTier;
    if (firstCrown) {
      this.celebrateFirstCrown(
        cellCenter(landed, this.origin, this.size),
        this.model.reachedTier,
      );
    }
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

  /** One-time fanfare the first time a crown is earned this session (usually the
   * 1024 merge, but a resumed game can first cross a record higher up, so the
   * banner shows the real value). A golden radial shine, a confetti burst, and
   * a "New Best!" banner that pops in and fades, with the original's best-score
   * clip. Deliberately unhurried so the moment registers. */
  private celebrateFirstCrown(center: { x: number; y: number }, tier: number): void {
    this.sfx.play("celebrate");

    const gold = 0xffd166;
    const cx = this.scale.width / 2;

    // Radial shine: a soft gold ring that expands and fades from the block.
    const shine = this.add.graphics().setDepth(1000);
    shine.lineStyle(Math.max(3, this.size * 0.08), gold, 0.9);
    shine.strokeCircle(0, 0, this.size * 0.6);
    shine.setPosition(center.x, center.y);
    shine.setScale(0.3);
    this.tweens.add({
      targets: shine,
      scale: 3,
      alpha: 0,
      ease: "Cubic.Out",
      duration: 1000,
      onComplete: () => shine.destroy(),
    });

    // Golden confetti burst from the crowned block.
    const confettiColors = [gold, 0xffe08a, 0xff8fab, 0x8ad0ff, 0xb9f6ca];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
      const speed = this.size * (1.0 + Math.random() * 1.6);
      const bit = this.add.graphics().setDepth(1001);
      const col = confettiColors[i % confettiColors.length];
      bit.fillStyle(col, 1);
      const r = Math.max(2, this.size * 0.06);
      bit.fillRoundedRect(-r, -r * 0.6, r * 2, r * 1.2, r * 0.3);
      bit.setPosition(center.x, center.y);
      bit.setRotation(Math.random() * Math.PI);
      this.tweens.add({
        targets: bit,
        x: center.x + Math.cos(angle) * speed,
        y: center.y + Math.sin(angle) * speed + this.size * 1.2, // gravity arc
        rotation: bit.rotation + (Math.random() - 0.5) * 8,
        alpha: 0,
        ease: "Quad.Out",
        duration: 1100 + Math.random() * 600,
        onComplete: () => bit.destroy(),
      });
    }

    // "New Best!" banner: pops in near the top of the board, holds, fades out.
    const bannerY = this.origin.y - this.size * 0.3;
    const banner = this.add
      .text(cx, bannerY, `New Best! ${tierLabel(tier)}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.floor(this.size * 0.42)}px`,
        color: "#ffd166",
        fontStyle: "bold",
        stroke: "#5a3d00",
        strokeThickness: Math.max(2, this.size * 0.04),
      })
      .setOrigin(0.5)
      .setDepth(1002)
      .setScale(0.2);
    this.tweens.add({
      targets: banner,
      scale: 1,
      ease: "Back.Out",
      duration: 550,
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          y: bannerY - this.size * 0.4,
          alpha: 0,
          ease: "Quad.In",
          delay: 1500,
          duration: 750,
          onComplete: () => banner.destroy(),
        });
      },
    });
  }

  /** Tutorial-only: draw a transient merged-result block at `landed` and pop it
   * in. The model isn't mutated during the tutorial, so this is a short-lived
   * overlay (destroyed when the next step loads a fresh board). */
  private flashMergeResult(landed: Pos, tier: number): void {
    const center = cellCenter(landed, this.origin, this.size);
    const s = this.size - this.size * 0.06 * 2;
    const g = this.add.graphics();
    g.fillStyle(tierColor(tier), 1);
    g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
    const t = this.add
      .text(0, 0, tierLabel(tier), {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.floor(this.size * 0.34)}px`,
        color: tierTextColor(tier),
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const block = this.add.container(center.x, center.y, [g, t]).setDepth(920);
    this.cellLayer.add(block);
    block.setScale(0.1);
    this.tweens.add({ targets: block, scale: 1, ease: "Back.Out", duration: 220 });
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
    // A soft downward swish as the whole board drops in (our addition — the
    // original has no load sound). Won't play on first page load until a user
    // gesture unlocks audio; audible on the New Game button.
    this.sfx?.play("newgame");
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

  // --- idle hint ----------------------------------------------------------

  /** Clear any shown hint, then restart the idle countdown. Call on every
   * interaction and after the board settles, so a hint only appears once the
   * player has sat still for HINT_IDLE_MS. */
  private resetHintTimer(): void {
    this.clearHint();
    this.hintTimer?.remove();
    this.hintTimer = this.time.delayedCall(
      BoardScene.HINT_IDLE_MS,
      () => this.showHint(),
    );
  }

  /** Remove the hint highlight (not the timer). */
  private clearHint(): void {
    this.hintTween?.remove();
    this.hintTween = undefined;
    this.hintGfx?.destroy();
    this.hintGfx = undefined;
  }

  /** Highlight one possible move (an equal adjacent pair) with a gentle pulse.
   * Skipped while the player is busy (dragging, targeting, tutorial, or over). */
  private showHint(): void {
    if (
      this.dragging ||
      this.model.targeting ||
      this.model.isOver ||
      this.tutorial?.isActive
    ) {
      return;
    }
    const pair = this.model.hint;
    if (!pair) return;
    const g = this.add.graphics().setDepth(400);
    const s = this.size - this.size * 0.06 * 2;
    for (const p of pair) {
      const c = cellCenter(p, this.origin, this.size);
      g.lineStyle(Math.max(4, this.size * 0.07), 0xffffff, 1);
      g.strokeRoundedRect(c.x - s / 2, c.y - s / 2, s, s, s * 0.18);
    }
    this.hintGfx = g;
    this.hintTween = this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0.25 },
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }
}
