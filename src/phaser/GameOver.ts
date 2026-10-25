import Phaser from "phaser";
import { COLORS } from "./theme";

/** A dim overlay with final score and a "New game" button. */
export class GameOverOverlay {
  private container: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private button: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private onRestart: () => void,
  ) {
    this.dim = scene.add.graphics();
    this.title = scene.add
      .text(0, 0, "No moves left", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: COLORS.text,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.scoreText = scene.add
      .text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffd166",
      })
      .setOrigin(0.5);
    this.button = scene.add
      .text(0, 0, "New game", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#10131a",
        backgroundColor: "#ffd166",
        padding: { x: 20, y: 12 },
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.button.on("pointerdown", (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      e: Phaser.Types.Input.EventData,
    ) => {
      e.stopPropagation?.();
      this.onRestart();
    });

    this.container = scene.add.container(0, 0, [
      this.dim,
      this.title,
      this.scoreText,
      this.button,
    ]);
    this.container.setDepth(1000).setVisible(false);
    this.layout();
  }

  layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.dim.clear();
    this.dim.fillStyle(0x000000, 0.72);
    this.dim.fillRect(0, 0, w, h);
    this.title.setPosition(w / 2, h / 2 - 70);
    this.scoreText.setPosition(w / 2, h / 2 - 20);
    this.button.setPosition(w / 2, h / 2 + 50);
  }

  show(score: bigint): void {
    this.scoreText.setText(`Score ${score.toString()}`);
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }
}
