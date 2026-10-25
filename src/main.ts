import Phaser from "phaser";
import { BoardScene } from "./phaser/BoardScene";
import { COLORS } from "./phaser/theme";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: "100%",
    height: "100%",
  },
  scene: [BoardScene],
});
