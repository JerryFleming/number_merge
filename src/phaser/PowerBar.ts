import Phaser from "phaser";
import type { PowerUp } from "../core/game";
import { POWER_BAR_H, bottomInset } from "./layout";

interface Button {
  power: PowerUp;
  /** Centered container holding glow + body + icon + label; scaled for anims. */
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Graphics;
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
      // Vector icon drawn with Graphics so all three share an identical visual
      // size (emoji rendered at inconsistent sizes across fonts).
      const icon = scene.add.graphics();
      this.drawIcon(icon, d.power, 34);
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

  /** Draw a power-up icon with Graphics, centered on (0,0), fitting a sz box. */
  private drawIcon(g: Phaser.GameObjects.Graphics, power: PowerUp, sz: number): void {
    g.clear();
    const u = sz / 2; // half-extent
    if (power === "hammer") {
      // Angled hammer: grey head + brown handle.
      g.save();
      g.rotateCanvas(Phaser.Math.DegToRad(-35));
      g.fillStyle(0x8a5a2b, 1);
      g.fillRoundedRect(-u * 0.14, -u * 0.1, u * 0.28, u * 1.2, u * 0.12);
      g.fillStyle(0x9aa3b2, 1);
      g.fillRoundedRect(-u * 0.75, -u * 0.55, u * 1.5, u * 0.5, u * 0.14);
      g.fillStyle(0xc7cdd8, 1);
      g.fillRoundedRect(-u * 0.75, -u * 0.55, u * 0.42, u * 0.5, u * 0.14);
      g.restore();
    } else if (power === "magnet") {
      // Horseshoe magnet: red U body with two tips (grey) at the bottom.
      g.lineStyle(u * 0.5, 0xe63946, 1);
      g.beginPath();
      g.arc(0, -u * 0.1, u * 0.62, Phaser.Math.DegToRad(180), 0, false);
      g.strokePath();
      // Vertical legs.
      g.fillStyle(0xe63946, 1);
      g.fillRect(-u * 0.87, -u * 0.1, u * 0.5, u * 0.8);
      g.fillRect(u * 0.37, -u * 0.1, u * 0.5, u * 0.8);
      // Pole tips.
      g.fillStyle(0xdfe4ec, 1);
      g.fillRect(-u * 0.87, u * 0.6, u * 0.5, u * 0.3);
      g.fillRect(u * 0.37, u * 0.6, u * 0.5, u * 0.3);
    } else {
      // Swap: two horizontal arrows pointing opposite ways, one above the other.
      g.fillStyle(0xffffff, 1);
      const bar = u * 0.26;
      const half = u * 0.72;
      // Top arrow -> right
      g.fillRect(-half, -u * 0.42 - bar / 2, half * 1.6, bar);
      g.fillTriangle(
        half * 0.6, -u * 0.42 - bar,
        half * 0.6, -u * 0.42 + bar,
        half * 1.0, -u * 0.42,
      );
      // Bottom arrow <- left
      g.fillRect(-half * 0.6, u * 0.42 - bar / 2, half * 1.6, bar);
      g.fillTriangle(
        -half * 0.6, u * 0.42 - bar,
        -half * 0.6, u * 0.42 + bar,
        -half * 1.0, u * 0.42,
      );
    }
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
      // Icon centered in the button (labels removed; icons only).
      btn.icon.setPosition(0, 0);
      // Count badge on the top-right of the round body (≈45° on the circle).
      const rr = Math.min(bw, bh) / 2;
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
