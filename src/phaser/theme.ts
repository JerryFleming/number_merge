import { tierValue, type Tier } from "../core/types";

/** Background and chrome colors. */
export const COLORS = {
  bg: 0x10131a,
  cellEmpty: 0x1b2030,
  line: 0xffd166,
  selected: 0xffffff,
  text: "#ffffff",
};

// Per-tier block colors matching the original game, sampled from in-game
// board screenshots. Tiers 1–6 (2…64) from a full-res capture; tiers 7–11 & 13
// (128…2048, 8192) from an earlier capture; tier 12 (4096) is interpolated
// (never seen). Indexed by tier-1; cycles for tiers beyond it.
const TIER_HUES = [
  0x287696, // 1  (2)    teal
  0xa23b72, // 2  (4)    magenta
  0xf18f01, // 3  (8)    orange
  0xc73e1d, // 4  (16)   rust red
  0x06a77d, // 5  (32)   green
  0x446df6, // 6  (64)   blue
  0xe8a3bb, // 7  (128)  pink
  0xc9d7fc, // 8  (256)  light periwinkle
  0xecbf6f, // 9  (512)  gold / tan
  0xe38a85, // 10 (1024) salmon
  0x4d98e9, // 11 (2048) sky blue
  0x3fb0a8, // 12 (4096) teal (interpolated — unseen)
  0x752f7e, // 13 (8192) purple
];

export function tierColor(tier: Tier): number {
  return TIER_HUES[(tier - 1) % TIER_HUES.length];
}

/** Readable number color for a tier: dark text on light blocks, white on dark.
 * Matches the original (e.g. dark on 512/128/256, white on 16/64/8192). */
export function tierTextColor(tier: Tier): string {
  const c = tierColor(tier);
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  // Perceived luminance (sRGB-ish). Above ~0.6 → use dark text.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#2a2320" : "#ffffff";
}

/** Whole number only — no fractions (4K, not 4.1K). */
function compact(n: number): string {
  return String(Math.round(n));
}

/** The number shown on a block: its value 2^tier (compact for large tiers). */
export function tierLabel(tier: Tier): string {
  const v = tierValue(tier);
  if (v < 1000) return String(v);
  if (v < 1_000_000) return compact(v / 1000) + "K";
  if (v < 1_000_000_000) return compact(v / 1_000_000) + "M";
  return compact(v / 1_000_000_000) + "B";
}
