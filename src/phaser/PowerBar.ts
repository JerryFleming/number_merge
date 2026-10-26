import Phaser from "phaser";
import type { PowerUp } from "../core/game";
import { POWER_BAR_H, bottomInset } from "./layout";
import { powerTexture } from "./assets";

interface Button {
  power: PowerUp;
  /** Centered container holding glow + body + icon + count; scaled for anims. */
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  /** The original game's power-up icon image. */
  icon: Phaser.GameObjects.Image;
  /** Usage count shown in the top-right corner. */
  count: Phaser.GameObjects.Text;
  bw: number;
  bh: number;
  glowTween?: Phaser.Tweens.Tween;
}

/** Bottom bar with three icon-only power-up buttons; tap toggles targeting
 * mode. Reacts to touch only: a press bounce on tap and a pulsing glow while a
 * power-up is armed (no idle animation when untouched). */
export class PowerBar {
  private buttons: Button[] = [];
  private active: PowerUp | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onSelect: (power: PowerUp) => void,
  ) {
    const defs: Array<{ power: PowerUp }> = [
      { power: "hammer" },
      { power: "magnet" },
      { power: "swap" },
    ];
    defs.forEach((d) => {
      const glow = scene.add.graphics();
      const body = scene.add.graphics();
      // The original game's power-up icon image (sized in layout()).
      const icon = scene.add.image(0, 0, powerTexture(d.power)).setOrigin(0.5);
      // Usage count in the top-right corner; hidden until first used.
      const count = scene.add
        .text(0, 0, "0", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "12px",
          color: "#10131a",
          fontStyle: "bold",
          backgroundColor: "#ffd166",
          padding: { x: 5, y: 1 },
        })
        .setOrigin(1, 0)
        .setVisible(false);
      const root = scene.add.container(0, 0, [glow, body, icon, count]);
      const btn: Button = { power: d.power, root, glow, body, icon, count, bw: 10, bh: 10 };

      root.setInteractive(
        new Phaser.Geom.Rectangle(-5, -5, 10, 10),
        Phaser.Geom.Rectangle.Contains,
      );
      root.on("pointerdown", (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        e: Phaser.Types.Input.EventData,
      ) => {
        e.stopPropagation?.();
        this.press(btn);
        this.toggle(btn.power);
      });

      this.buttons.push(btn);
    });
    this.layout();
  }

  private toggle(power: PowerUp): void {
    this.active = this.active === power ? null : power;
    this.render();
    this.onSelect(power);
  }

  clearActive(): void {
    this.active = null;
    this.render();
  }

  /** Update the top-right usage badges; hidden while a power-up is unused. */
  setCounts(counts: Readonly<Record<PowerUp, number>>): void {
    this.buttons.forEach((btn) => {
      const n = counts[btn.power] ?? 0;
      btn.count.setText(String(n));
      btn.count.setVisible(n > 0);
    });
  }

  // --- animations ---------------------------------------------------------

  /** Quick press bounce on tap. */
  private press(btn: Button): void {
    this.scene.tweens.add({
      targets: btn.root,
      scale: 0.86,
      duration: 80,
      yoyo: true,
      ease: "Quad.Out",
    });
  }

  private setArmedGlow(btn: Button, armed: boolean): void {
    btn.glowTween?.remove();
    btn.glowTween = undefined;
    btn.glow.setAlpha(0);
    if (!armed) return;
    // Pulse the glow while the power-up is armed (awaiting a target tap).
    btn.glowTween = this.scene.tweens.add({
      targets: btn.glow,
      alpha: { from: 0.25, to: 0.8 },
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  // --- layout / draw ------------------------------------------------------

  layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const n = this.buttons.length;
    const pad = 20; // gap between the round buttons
    const bh = POWER_BAR_H - pad * 2;
    // Round buttons: width tracks height so each column is the circle's box;
    // never let it exceed the space available across the row.
    const available = (w - pad * (n + 1)) / n;
    const bw = Math.min(bh, available);
    // Lift the bar above the iOS home indicator and the mobile browser's
    // bottom URL bar (safe-area inset + a fixed margin).
    const y = h - POWER_BAR_H + pad - bottomInset();
    const groupW = bw * n + pad * (n - 1);
    const startX = (w - groupW) / 2;
    this.buttons.forEach((btn, i) => {
      const cx = startX + i * (bw + pad) + bw / 2;
      const cy = y + bh / 2;
      btn.bw = bw;
      btn.bh = bh;
      btn.root.setPosition(cx, cy);
      // Icon centered in the round body, scaled uniformly to fit within it
      // (preserve each icon's aspect ratio — they differ slightly).
      const rr = Math.min(bw, bh) / 2;
      const target = rr * 1.5;
      const srcMax = Math.max(btn.icon.width, btn.icon.height) || target;
      btn.icon.setPosition(0, 0).setScale(target / srcMax);
      // Count badge on the top-right of the round body (≈45° on the circle).
      btn.count.setPosition(rr * 0.72, -rr * 0.72);
      // Hit area = the circle's bounding square, so taps match the visible body.
      (btn.root.input!.hitArea as Phaser.Geom.Rectangle).setTo(
        -rr,
        -rr,
        rr * 2,
        rr * 2,
      );
    });
    this.render();
  }

  private render(): void {
    this.buttons.forEach((btn) => {
      const on = this.active === btn.power;
      const { bw, bh } = btn;
      // Round body: a circle sized to the button's shorter dimension, centered
      // on the container origin.
      const r = Math.min(bw, bh) / 2;
      btn.body.clear();
      btn.body.fillStyle(on ? 0xffd166 : 0x242b3d, 1);
      btn.body.fillCircle(0, 0, r);
      // Glow halo behind the body (shown only while armed, via tween alpha).
      btn.glow.clear();
      btn.glow.fillStyle(0xffd166, 1);
      btn.glow.fillCircle(0, 0, r + 8);
      this.setArmedGlow(btn, on);
    });
  }
}
