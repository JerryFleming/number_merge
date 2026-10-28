import Phaser from "phaser";
import { BoardScene } from "./phaser/BoardScene";
import { COLORS } from "./phaser/theme";

// iOS routes Web Audio through the "ambient" session, which the ring/silent
// switch mutes. Ask for "playback" so sound follows the volume buttons, like
// a native game. Safari 16.4+; a no-op elsewhere.
const nav = navigator as Navigator & { audioSession?: { type: string } };
if (nav.audioSession) nav.audioSession.type = "playback";

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
