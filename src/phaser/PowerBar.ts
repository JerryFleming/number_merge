import Phaser from "phaser";
import type { PowerUp } from "../core/game";
import { POWER_BAR_H } from "./layout";
import { COLORS } from "./theme";

interface Button {
  power: PowerUp;
  label: string;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
}

/** Bottom bar with three power-up buttons; tap toggles targeting mode. */
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
    for (const d of defs) {
      const bg = scene.add.graphics();
      const text = scene.add
        .text(0, 0, d.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const btn: Button = { power: d.power, label: d.label, bg, text };
      bg.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 10, 10),
        Phaser.Geom.Rectangle.Contains,
      );
      bg.on("pointerdown", (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        e: Phaser.Types.Input.EventData,
      ) => {
        e.stopPropagation?.();
        this.toggle(btn.power);
      });
      this.buttons.push(btn);
    }
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

  layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const n = this.buttons.length;
    const pad = 12;
    // Cap each button's width so the group doesn't stretch edge-to-edge on
    // wide screens; center the whole row horizontally.
    const maxBtnW = 140;
    const available = (w - pad * (n + 1)) / n;
    const bw = Math.min(maxBtnW, available);
    const bh = POWER_BAR_H - pad * 2;
    const y = h - POWER_BAR_H + pad;
    const groupW = bw * n + pad * (n - 1);
    const startX = (w - groupW) / 2;
    this.buttons.forEach((btn, i) => {
      const x = startX + i * (bw + pad);
      btn.bg.setData("rect", { x, y, bw, bh });
      btn.bg.input!.hitArea.setTo(0, 0, bw, bh);
      btn.bg.setPosition(x, y);
      btn.text.setPosition(x + bw / 2, y + bh / 2);
    });
    this.render();
  }

  private render(): void {
    this.buttons.forEach((btn) => {
      const r = btn.bg.getData("rect") as {
        x: number;
        y: number;
        bw: number;
        bh: number;
      };
      btn.bg.clear();
      const on = this.active === btn.power;
      btn.bg.fillStyle(on ? 0xffd166 : 0x242b3d, 1);
      // Graphics drawn in local space from (0,0) because we setPosition'd it.
      btn.bg.fillRoundedRect(0, 0, r.bw, r.bh, 12);
      btn.text.setColor(on ? "#10131a" : COLORS.text);
    });
  }
}
