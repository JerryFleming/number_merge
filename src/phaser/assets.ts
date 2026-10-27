// Image assets extracted from the original "Number Match" game, imported so
// Vite bundles and fingerprints them. Keys are the Phaser texture names.
import hammerUrl from "../assets/pu-hammer.png";
import magnetUrl from "../assets/pu-magnet.png";
import swapUrl from "../assets/pu-swap.png";
import gameIconUrl from "../assets/game-icon.png";
import crownUrl from "../assets/crown.png";
import handUrl from "../assets/hand.png";

export const TEX = {
  puHammer: "pu-hammer",
  puMagnet: "pu-magnet",
  puSwap: "pu-swap",
  gameIcon: "game-icon",
  // The original's "block-add-crown-icon" sprite, marking the highest-tier
  // block reached so far.
  crown: "crown",
  // The original's "tutorial-hand" pointing-hand cursor for the first-run demo.
  hand: "hand",
} as const;

/** [textureKey, url] pairs to feed this.load.image() in preload(). */
export const IMAGE_ASSETS: ReadonlyArray<readonly [string, string]> = [
  [TEX.puHammer, hammerUrl],
  [TEX.puMagnet, magnetUrl],
  [TEX.puSwap, swapUrl],
  [TEX.gameIcon, gameIconUrl],
  [TEX.crown, crownUrl],
  [TEX.hand, handUrl],
];

/** The power-up texture key for a given power. */
export function powerTexture(power: "hammer" | "magnet" | "swap"): string {
  return power === "hammer"
    ? TEX.puHammer
    : power === "magnet"
      ? TEX.puMagnet
      : TEX.puSwap;
}
