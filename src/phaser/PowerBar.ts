import Phaser from "phaser";
import type { PowerUp } from "../core/game";
import { POWER_BAR_H } from "./layout";
import { COLORS } from "./theme";

interface Button {
  power: PowerUp;
  /** Centered container holding glow + body + label; scaled for animations. */
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  bw: number;
  bh: number;
  idle?: Phaser.Tweens.Tween;
  glowTween?: Phaser.Tweens.Tween;
}

/** Bottom bar with three power-up buttons; tap toggles targeting mode.
 * Animates like the original: an idle breathing pulse, a press bounce, and a
 * pulsing glow while a power-up is armed. */
export class PowerBar {
  private buttons: Button[] = [];
  private active: PowerUp | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onSelect: (power: PowerUp) => void,
  ) {
    const defs: Array<{ power: PowerUp; label: string }> = [
      { power: "hammer", label: "🔨 Hammer" },
      { power: "magnet", label: "🧲 Magnet" },
      { power: "swap", label: "🔀 Swap" },
    ];
    defs.forEach((d, i) => {
      const glow = scene.add.graphics();
      const body = scene.add.graphics();
      const text = scene.add
        .text(0, 0, d.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const root = scene.add.container(0, 0, [glow, body, text]);
      const btn: Button = { power: d.power, root, glow, body, text, bw: 10, bh: 10 };

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
      // Stagger the idle breathing so the three buttons don't pulse in unison.
      this.startIdle(btn, i * 220);
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

  // --- animations ---------------------------------------------------------

  /** Gentle continuous scale "breathing", like the original's ButtonScaleUp. */
  private startIdle(btn: Button, delay: number): void {
    btn.idle?.remove();
    btn.root.setScale(1);
    btn.idle = this.scene.tweens.add({
      targets: btn.root,
      scale: 1.05,
      duration: 900,
      delay,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

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
    const pad = 12;
    const maxBtnW = 140;
    const available = (w - pad * (n + 1)) / n;
    const bw = Math.min(maxBtnW, available);
    const bh = POWER_BAR_H - pad * 2;
    const y = h - POWER_BAR_H + pad;
    const groupW = bw * n + pad * (n - 1);
    const startX = (w - groupW) / 2;
    this.buttons.forEach((btn, i) => {
      const cx = startX + i * (bw + pad) + bw / 2;
      const cy = y + bh / 2;
      btn.bw = bw;
      btn.bh = bh;
      btn.root.setPosition(cx, cy);
      (btn.root.input!.hitArea as Phaser.Geom.Rectangle).setTo(
        -bw / 2,
        -bh / 2,
        bw,
        bh,
      );
    });
    this.render();
  }

  private render(): void {
    this.buttons.forEach((btn) => {
      const on = this.active === btn.power;
      const { bw, bh } = btn;
      // Body (drawn centered on the container origin).
      btn.body.clear();
      btn.body.fillStyle(on ? 0xffd166 : 0x242b3d, 1);
      btn.body.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
      btn.text.setColor(on ? "#10131a" : COLORS.text);
      // Glow halo behind the body (shown only while armed, via tween alpha).
      btn.glow.clear();
      btn.glow.fillStyle(0xffd166, 1);
      btn.glow.fillRoundedRect(-bw / 2 - 8, -bh / 2 - 8, bw + 16, bh + 16, 16);
      this.setArmedGlow(btn, on);
    });
  }
}
